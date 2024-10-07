export const PlanDisplay = ({ plan }) => {
    if (!plan) {
      return null;
    }

    return (
      <div style={styles.container}>
          <div style={styles.stepContainer}>
            <h2 style={styles.stepName}>{plan.stepName}</h2>
            <p><strong>Description:</strong> {plan.description}</p>
            <p><strong>Expected Insight:</strong> {plan.expectedInsight}</p>
            
            <div style={styles.section}>
              <h4>Data Requirements:</h4>
              <ul>
                {plan.dataRequirements && plan.dataRequirements.map((data, idx) => (
                  <li key={idx}>{data}</li>
                ))}
              </ul>
            </div>
  
            <div style={styles.section}>
              <h4>Transformations:</h4>
              <ul>
                {plan.transformations && plan.transformations.map((transformation, idx) => (
                  <li key={idx}>{transformation}</li>
                ))}
              </ul>
            </div>
  
            <p><strong>Visualization:</strong> {plan.visualization}</p>
            <hr />
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
  