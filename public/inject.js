console.log('Inject.js loaded');

let isRunning = false;
let unfollowCount = 0;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Create floating controls with verified counter
function createFloatingControls(showVerifiedCount = false) {
  const controls = document.createElement('div');
  controls.id = 'x-unfollow-controls';
  controls.innerHTML = `
    <div class="counters">
      ${!showVerifiedCount ? 
        `<div class="counter">0</div>` :
        `<div class="verified-counter">Verified: 0</div>`
      }
    </div>
    <button class="stop-button">Stop</button>
  `;
  
  controls.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
    align-items: center;
    background: rgba(0, 0, 0, 0.8);
    padding: 10px 20px;
    border-radius: 20px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;

  const counters = controls.querySelector('.counters');
  counters.style.cssText = `
    color: white;
    font-weight: bold;
    font-size: 14px;
  `;

  const stopButton = controls.querySelector('.stop-button');
  stopButton.style.cssText = `
    background: #E0245E;
    color: white;
    border: none;
    padding: 5px 15px;
    border-radius: 15px;
    cursor: pointer;
    font-weight: bold;
    font-size: 12px;
  `;

  stopButton.addEventListener('click', () => {
    isRunning = false;
    controls.remove();
  });

  document.body.appendChild(controls);
  return controls;
}

async function waitForLoad() {
  const maxAttempts = 20; // Maximum number of attempts (10 seconds total)
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Check if the timeline is loaded
    const timeline = document.querySelector('[data-testid="primaryColumn"]');
    const cells = document.querySelectorAll('[data-testid="UserCell"]');
    
    if (timeline && cells.length > 0) {
      console.log('Page loaded successfully');
      return true;
    }

    console.log('Waiting for page to load...');
    await delay(500); // Check every 500ms
    attempts++;
  }

  console.log('Page load timeout');
  return false;
}

// Add new function to count verified followers
async function countVerifiedFollowers() {
  console.log('Starting verified followers count');
  
  const isLoaded = await waitForLoad();
  if (!isLoaded) {
    chrome.runtime.sendMessage({ 
      type: 'STATUS_UPDATE', 
      message: 'Error: Page failed to load. Please refresh and try again.'
    });
    return;
  }

  isRunning = true;
  let verifiedCount = 0;
  let processedUsers = new Set();
  let lastProcessedCount = 0;
  let noNewUsersCount = 0;
  
  const controls = createFloatingControls(true);
  const counter = controls.querySelector('.verified-counter');
  
  // Scroll to top first
  window.scrollTo(0, 0);
  await delay(1000);

  while (isRunning) {
    const userCells = document.querySelectorAll('[data-testid="UserCell"]');
    console.log('Found user cells:', userCells.length);
    
    if (userCells.length === 0) {
      console.log('No users found');
      break;
    }

    let foundNewUsers = false;

    // Process visible users
    for (const cell of userCells) {
      if (!isRunning) break;
      
      try {
        // Get user handle from the link
        const userLink = cell.querySelector('a[href*="/"]');
        const userHandle = userLink?.href?.split('/').pop();
        
        if (!userHandle || processedUsers.has(userHandle)) {
          continue;
        }
        
        foundNewUsers = true;
        processedUsers.add(userHandle);

        const verifiedIcon = cell.querySelector('[data-testid="icon-verified"]');
        const followsYouText = Array.from(cell.querySelectorAll('[data-testid="userFollowIndicator"]'))
          .find(el => el.textContent.includes('Follows you'));
        
        if (verifiedIcon && followsYouText) {
          verifiedCount++;
          console.log('Found verified follower:', userHandle);
          counter.textContent = `Verified: ${verifiedCount}`;
          chrome.runtime.sendMessage({ 
            type: 'VERIFIED_COUNT_UPDATE', 
            count: verifiedCount 
          });
        }
      } catch (error) {
        console.error('Error processing user:', error);
      }
    }

    // Check if we found any new users
    if (processedUsers.size === lastProcessedCount) {
      noNewUsersCount++;
    } else {
      noNewUsersCount = 0;
      lastProcessedCount = processedUsers.size;
    }

    // If we haven't found new users in 3 consecutive scrolls, we're probably at the end
    if (noNewUsersCount >= 3) {
      console.log('No new users found after multiple scrolls, ending count');
      break;
    }

    // Controlled scrolling
    const viewportHeight = window.innerHeight;
    const currentPosition = window.scrollY;
    const scrollDistance = viewportHeight * 0.7; // Scroll 70% of viewport height
    
    // Smooth scroll
    for (let i = 0; i < scrollDistance; i += 50) {
      if (!isRunning) break;
      window.scrollTo(0, currentPosition + i);
      await delay(10);
    }

    // Wait for new content to load
    await delay(1500);
  }

  // Final status update
  const finalMessage = isRunning ? 
    `Completed: Found ${verifiedCount} verified followers` : 
    'Counting stopped';
    
  chrome.runtime.sendMessage({ 
    type: 'STATUS_UPDATE', 
    message: finalMessage,
    count: verifiedCount 
  });

  await delay(2000);
  if (controls) controls.remove();
}

window.unfollowAccounts = async function({ onlyNonFollowers = true, skipVerified = false, accountsToAvoid = [] }) {
  console.log('Unfollow process started', { onlyNonFollowers, skipVerified, accountsToAvoid });
  
  // Wait for the page to load
  const isLoaded = await waitForLoad();
  if (!isLoaded) {
    chrome.runtime.sendMessage({ 
      type: 'STATUS_UPDATE', 
      message: 'Error: Page failed to load. Please refresh and try again.'
    });
    return;
  }

  isRunning = true;
  unfollowCount = 0;
  
  const controls = createFloatingControls();
  const counter = controls.querySelector('.counter');
  
  const unfollowSelector = '[data-testid$="-unfollow"]';
  const confirmSelector = '[data-testid="confirmationSheetConfirm"]';
  
  while (isRunning) {
    const userCells = document.querySelectorAll('[data-testid="UserCell"]');
    console.log('Found user cells:', userCells.length);
    
    if (userCells.length === 0) {
      console.log('No more users found');
      chrome.runtime.sendMessage({ 
        type: 'STATUS_UPDATE', 
        message: 'No more accounts to check',
        count: unfollowCount 
      });
      controls.remove();
      break;
    }

    for (const cell of userCells) {
      if (!isRunning) {
        controls.remove();
        break;
      }
      
      try {
        const userLink = cell.querySelector('a[href*="/"]');
        const username = userLink?.href?.split('/').pop();
        
        // Skip if username is in the avoid list
        if (accountsToAvoid.includes(username)) {
          console.log('Skipping avoided account:', username);
          continue;
        }

        const followsYouIndicator = cell.querySelector('[data-testid="userFollowIndicator"]');
        const verifiedIcon = cell.querySelector('[data-testid="icon-verified"]');
        const unfollowButton = cell.querySelector(unfollowSelector);
        
        if (!unfollowButton) continue;

        // Skip if it's a verified account and skipVerified is true
        if (skipVerified && verifiedIcon) {
          console.log('Skipping verified account');
          continue;
        }

        // Check if we should unfollow based on following status
        if (!onlyNonFollowers || !followsYouIndicator) {
          console.log('Unfollowing user');
          unfollowButton.click();
          
          for (let i = 0; i < 10; i++) {
            const confirmButton = document.querySelector(confirmSelector);
            if (confirmButton) {
              confirmButton.click();
              unfollowCount++;
              counter.textContent = unfollowCount;
              console.log('Unfollowed count:', unfollowCount);
              chrome.runtime.sendMessage({ 
                type: 'COUNT_UPDATE', 
                count: unfollowCount 
              });
              break;
            }
            await delay(50);
          }
          
          await delay(500);
        }
      } catch (error) {
        console.error('Error during unfollow:', error);
      }
    }

    window.scrollTo(0, document.body.scrollHeight);
    await delay(1000);
  }
}

// Update message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  if (request.action === 'START') {
    window.unfollowAccounts({
      onlyNonFollowers: request.onlyNonFollowers,
      skipVerified: request.skipVerified,
      accountsToAvoid: request.accountsToAvoid
    });
    sendResponse({ message: 'Started' });
  }
  else if (request.action === 'COUNT_VERIFIED') {
    countVerifiedFollowers();
    sendResponse({ message: 'Started counting' });
  }
  else if (request.action === 'STOP') {
    isRunning = false;
    const controls = document.getElementById('x-unfollow-controls');
    if (controls) controls.remove();
    sendResponse({ message: 'Stopping...' });
  }
  return true;
});
