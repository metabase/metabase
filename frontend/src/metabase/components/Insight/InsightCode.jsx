import React, { useState } from 'react';

export const InsightCode = ({ index, insightCode }) => {
  const [isCodeVisible, setIsCodeVisible] = useState(false);

    if (!insightCode) {
      return null;
    }

 // Function to highlight comments in code
 const highlightCode = (code) => {
    return code.split('\n').map((line, i) => {
      if (line.trim().startsWith('#')) {
        return <div key={i} style={styles.comment}>{line}</div>;
      }
      return <div key={i}>{line}</div>;
    });
  };

  const toggleCodeVisibility = () => {
    setIsCodeVisible(!isCodeVisible);
  };

  return (
    <div style={styles.container}>
      {isCodeVisible && (
        <div style={styles.stepContainer}>
          <pre style={styles.codeBlock}>
            {highlightCode(insightCode)}
          </pre>
        </div>
      )}
      <div style={styles.buttonContainer}>
        <button 
          onClick={toggleCodeVisibility} 
          style={styles.button}
        >
          {isCodeVisible ? 'Hide Code' : 'Check Code'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
  },
  stepContainer: {
    padding: '20px',
    border: '1px solid #444',
    marginBottom: '20px',
    borderRadius: '8px',
    backgroundColor: '#2e2e2e',
    color: '#dcdcdc',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
    width: '100%',
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
    width: '100%',
  },
  button: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#8A64DF',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  codeBlock: {
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
    overflowWrap: 'break-word',
    fontSize: '16px',
  },
  comment: {
    color: '#6a8759',
    fontStyle: 'italic',
  }
};