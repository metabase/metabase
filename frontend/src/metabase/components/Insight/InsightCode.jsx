export const InsightCode = ({ index, insightCode }) => {
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

  return (
    <div style={styles.container}>
      <div style={styles.stepContainer}>
        {/* <h2 style={styles.stepName}>{index + 1}</h2> */}
        <pre style={styles.codeBlock}>
          {highlightCode(insightCode)}
        </pre>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
  },
  stepContainer: {
    padding: '20px',
    border: '1px solid #444',
    marginBottom: '20px',
    borderRadius: '8px',
    backgroundColor: '#2e2e2e', // Dark background
    color: '#dcdcdc', // Light text color
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', // Subtle shadow
    maxWidth: '800px', // Max width for better readability
    width: '100%',
  },
  stepName: {
    marginBottom: '15px',
    fontSize: '18px',
    color: '#c5e478', // Light green color for step number
  },
  codeBlock: {
    whiteSpace: 'pre-wrap', // Maintain formatting
    fontFamily: 'monospace', // Monospace font for code
    overflowWrap: 'break-word', // Ensure long lines break
    fontSize: '16px', 
  },
  comment: {
    color: '#6a8759', // Style for comments
    fontStyle: 'italic', // Italicize comments
  }
};