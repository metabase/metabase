export const TableDisplay = ({ tables, reasoning }) => {
    if (!tables) {
      return null;
    }

    return (
      <div style={styles.container}>
          <div style={styles.stepContainer}>
            <h2 style={styles.stepName}>Reasoning</h2>
            <p><strong>{reasoning}</strong> </p>
            <h2 style={styles.stepName}>Tables</h2>
            {tables && tables.map((table, idx) => (
              <div key={idx}>
                <p><strong>{table.name}</strong> </p>
              </div>
            ))}
          </div>
      </div>
    );
  };
  
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    },
    stepContainer: {
      padding: '20px',
      border: '1px solid #555', // Darker border for stronger contrast
      marginBottom: '20px',
      borderRadius: '8px',
      backgroundColor: '#343a40', // Slightly darker gray background
      color: '#e0e0e0', // Brighter light gray text color
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)', // Stronger shadow
      maxWidth: '800px',
      width: '100%',
    },
    stepName: {
      marginBottom: '15px',
      fontSize: '18px',
      color: '#9acd32', // Yellow-green color for better readability
    },
    section: {
      marginBottom: '10px',
    },
  };
  