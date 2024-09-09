import ReactMarkdown from 'react-markdown';

export const InsightText = ({ index, insightText }) => {
    if (!insightText) {
      return null;
    }

    return (
      <div style={styles.wrapper}>
          <div style={styles.stepContainer}>
            {/* <h2 style={styles.stepName}>{index + 1}</h2> */}
            <ReactMarkdown style={styles.insightText}>{insightText}</ReactMarkdown>
          </div>
      </div>
    );
  };
  
  const styles = {
    wrapper: {
      display: 'flex',
      justifyContent: 'center',
    },
    stepContainer: {
      padding: '15px',
      marginBottom: '25px',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      color: '#4a4a4a',
      boxShadow: '0 6px 10px rgba(0, 0, 0, 0.3)',
      maxWidth: '800px',
      width: '100%',
    },
    stepName: {
      marginBottom: '12px',
      fontSize: '20px',
      color: '#76c7c0', // Softer turquoise color for step number
    },
    insightText: {
      fontSize: '20px',
      lineHeight: '1.6',
      color: '#eaeaea', // Light color for the Markdown text
    },
  };