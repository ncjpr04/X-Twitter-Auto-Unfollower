import { useState, useEffect } from 'react';
import styles from '../../styles/Pages.module.css';
import Socials from '../Socials';
import { ThemeToggle } from '../theme-toggle';
export default function Index() {
  const [status, setStatus] = useState('Ready to start');
  const [count, setCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [onlyNonFollowers, setOnlyNonFollowers] = useState(true);
  const [skipVerified, setSkipVerified] = useState(false);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [avoidAccounts, setAvoidAccounts] = useState('');

  useEffect(() => {
    const messageListener = (request) => {
      console.log('Received message:', request);
      if (request.type === 'COUNT_UPDATE') {
        setCount(request.count);
      }
      if (request.type === 'VERIFIED_COUNT_UPDATE') {
        setVerifiedCount(request.count);
      }
      if (request.type === 'STATUS_UPDATE') {
        setStatus(request.message);
        setIsRunning(false);
      }
    };

    // chrome.runtime.onMessage.addListener(messageListener);
    // return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const handleUnfollow = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('x.com')) {
        setStatus('Please navigate to X (formerly Twitter) first');
        return;
      }

      // Parse the accounts to avoid
      const accountsToAvoid = avoidAccounts
        .split(',')
        .map(account => account.trim())
        .filter(account => account.length > 0);

      setStatus('Starting unfollow process...');
      setIsRunning(true);
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['inject.js']
      });

      chrome.tabs.sendMessage(tab.id, { 
        action: 'START',
        onlyNonFollowers,
        skipVerified,
        accountsToAvoid
      });
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error.message}`);
      setIsRunning(false);
    }
  };

  const handleCountVerified = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes('x.com')) {
        setStatus('Please navigate to X (formerly Twitter) first');
        return;
      }

      setStatus('Counting verified followers...');
      setIsRunning(true);

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['inject.js']
      });

      chrome.tabs.sendMessage(tab.id, {
        action: 'COUNT_VERIFIED'
      });
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error.message}`);
      setIsRunning(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className='social'>
        <Socials />
        {/* <ThemeToggle/>  */}
      </div>
      <div className='extension'>
        <h1 className={styles.title}>X Auto Unfollow</h1>

        <div className={styles.optionContainer}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={onlyNonFollowers}
              onChange={(e) => setOnlyNonFollowers(e.target.checked)}
            />
            Only unfollow accounts that don't follow back
          </label>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={skipVerified}
              onChange={(e) => setSkipVerified(e.target.checked)}
            />
            Skip verified accounts
          </label>

          <div className={styles.inputContainer}>
            <label className={styles.inputLabel}>
              Accounts to avoid (comma-separated):
              <input
                type="text"
                value={avoidAccounts}
                onChange={(e) => setAvoidAccounts(e.target.value)}
                placeholder="e.g., user1, user2, user3"
                className={styles.textInput}
              />
            </label>
          </div>
        </div>

        <div className={styles.stats}>
          <p className={styles.statusText}>Unfollowed: {count} accounts</p>
          <p className={styles.statusText}>Verified followers: {verifiedCount}</p>
        </div>

        <div className={styles.buttonGroup}>
          {!isRunning ? (
            <>
              <button className={styles.button} onClick={handleUnfollow}>
                Start Unfollowing
              </button>
              <button className={styles.countButton} onClick={handleCountVerified}>
                Count Verified Followers
              </button>
            </>
          ) : (
            <button className={styles.stopButton} onClick={() => {
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP' });
              });
            }}>
              Stop
            </button>
          )}
        </div>

        <p className={styles.statusText}>{status}</p>
      </div>
    </div>
  );
}
