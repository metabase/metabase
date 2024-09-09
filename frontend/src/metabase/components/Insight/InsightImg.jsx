export const InsightImg = ({ index, insightImg }) => {
    if (!insightImg) {
      return null;
    }

    return (
      <div>
          <div style={styles.stepContainer}>
            {/* <h2 style={styles.stepName}>{index + 1}</h2> */}
            <img src={insightImg} alt="Insight Visualization" style={{
                            maxHeight: "100%",
                            maxWidth: "100%",
                            }} />
            <hr />
          </div>
      </div>
    );
  };
  
  const styles = {
    stepContainer: {
      padding: '10px',
      border: '1px solid #ddd',
      marginBottom: '20px',
      borderRadius: '5px',
      backgroundColor: '#f9f9f9'
    },
    stepName: {
      marginBottom: '10px',
      color: '#333'
    },
    section: {
      marginBottom: '10px'
    }
  };