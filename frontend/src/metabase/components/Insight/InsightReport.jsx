export const InsightReport = ({ insightTitle, insightSummary, insightSections, insightRecommendations }) => {
    if (!insightTitle || !insightSummary || !insightSections || !insightRecommendations) {
      return null;
    }
    return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h1 style={styles.title}>{insightTitle}</h1>
            <p style={styles.summary}>{insightSummary}</p>
            
            <div style={styles.sectionsContainer}>
              {insightSections.map((section, idx) => (
                <div key={idx} style={styles.section}>
                  <h2 style={styles.sectionHeading}>{section.heading}</h2>
                  <p style={styles.sectionContent}>{section.content}</p>
                </div>
              ))}
            </div>
    
            {insightRecommendations && insightRecommendations.length > 0 && (
              <div style={styles.recommendationsContainer}>
                <h2 style={styles.recommendationsHeading}>Recommendations</h2>
                <ul style={styles.recommendationsList}>
                  {insightRecommendations.map((recommendation, idx) => (
                    <li key={idx} style={styles.recommendationItem}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    };
    
    const styles = {
      container: {
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px',
      },
      card: {
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        padding: '24px',
      },
      title: {
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '16px',
        color: '#333',
      },
      summary: {
        fontSize: '16px',
        lineHeight: '1.5',
        marginBottom: '24px',
        color: '#555',
      },
      sectionsContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      },
      section: {
        borderTop: '1px solid #eee',
        paddingTop: '16px',
      },
      sectionHeading: {
        fontSize: '20px',
        fontWeight: 'bold',
        marginBottom: '12px',
        color: '#444',
      },
      sectionContent: {
        fontSize: '16px',
        lineHeight: '1.5',
        color: '#555',
      },
      recommendationsContainer: {
        marginTop: '32px',
      },
      recommendationsHeading: {
        fontSize: '20px',
        fontWeight: 'bold',
        marginBottom: '16px',
        color: '#444',
      },
      recommendationsList: {
        listStyleType: 'disc',
        paddingLeft: '24px',
      },
      recommendationItem: {
        fontSize: '16px',
        lineHeight: '1.5',
        marginBottom: '8px',
        color: '#555',
      },
    };