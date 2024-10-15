import { useState } from "react";
import { Icon } from "metabase/ui";
export const PlanDisplay = ({ plan, index }) => {
  const [expanded, setExpanded] = useState(index == 0 ? true : false);

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
    if (!plan) {
      return null;
    }

    return (
      <div style={styles.container}>
           <div style={{
          ...styles.stepContainer,
          padding: expanded ? '20px' : '10px',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p><strong>Step {index + 1}: {plan.step_name}</strong></p>
              <Icon style={{ cursor: 'pointer'}} onClick={toggleExpanded} name={expanded ? "chevronup" : "chevrondown"} size={14} />
            </div>
            {expanded ? (
              <div style={{ paddingLeft: '20px' }}>
                <p><strong>Title:</strong> {plan.step_name}</p>
                <p><strong>Description:</strong> {plan.goal}</p>
                <p><strong>Expected Insight:</strong> {plan.expected_insights}</p>
                
                <div style={styles.section}>
                  <h4>Python Opereations:</h4>
                  <ul>
                    {plan.python_operations && plan.python_operations.map((data, idx) => (
                      <li key={idx}>{data}</li>
                    ))}
                  </ul>
                </div>
      
                <div style={styles.section}>
                  <h4>Transformations:</h4>
                  <ul>
                    {plan.data_transformations && plan.data_transformations.map((transformation, idx) => (
                      <li key={idx}>{transformation}</li>
                    ))}
                  </ul>
                </div>
      
                <div style={styles.section}>
                  <h4>Visualizations:</h4>
                  <ul>
                    {plan.visualizations && plan.visualizations.map((transformation, idx) => (
                      <li key={idx}>{transformation}</li>
                    ))}
                  </ul>
                </div>
                </div>
            ): (
              <div></div>
            )}
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
      border: '1px solid #E0E4E9',
      marginBottom: '10px',
      borderRadius: '8px',
      backgroundColor: '#fff',
      maxWidth: '1300px',
      width: '100%',
    },
    stepName: {
      marginBottom: '15px',
      fontSize: '18px',
    },
    section: {
      marginBottom: '10px',
    },
  };
  