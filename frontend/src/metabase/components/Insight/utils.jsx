export const styles = {
    insightTextWrapper: {
        fontSize: '14px',
        lineHeight: '1.6',
        color: '#4a4a4a',
        textAlign: 'left', 
    },
    stepContainer: {
      padding: '20px',
      border: '1px solid #444',
      marginBottom: '20px',
      borderRadius: '8px',
      backgroundColor: '#2e2e2e',
      color: '#dcdcdc',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
    },
    codeBlock: {
      textAlign: 'left',
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

export const highlightCode = (code) => {
    return code.split('\n').map((line, i) => {
      if (line.trim().startsWith('#')) {
        return <div key={i} style={styles.comment}>{line}</div>;
      }
      return <div key={i}>{line}</div>;
    });
  };