import { useEffect, useRef } from "react";
import Message from "./Message";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import { Button, Icon, Loader } from "metabase/ui";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import { MonospaceErrorDisplay } from "../ErrorDetails/ErrorDetails.styled";
import { Skeleton } from "metabase/ui";
import { PlanDisplay } from "metabase/components/Insight/InsightPlan";
import { InsightText } from "metabase/components/Insight/InsightText";
import { InsightImg } from "metabase/components/Insight/InsightImg";
import { InsightCode } from "metabase/components/Insight/InsightCode";
import { TableDisplay } from "../Insight/InsightTable";
import { InsightReport } from "../Insight/InsightReport";
import JSZip from 'jszip';

const ChatMessageList = ({
  messages,
  isLoading,
  onFeedbackClick,
  approvalChangeButtons,
  onApproveClick,
  onDenyClick,
  onSuggestion,
  card,
  defaultQuestion,
  result,
  openModal,
  insightsList,
  showError,
  insightsPlan,
  insightsText,
  insightsImg,
  insightsCode,
  showCubeEditButton,
  sendAdminRequest,
  insightsCsv,
  insightFile,
  insightTables,
  insightReasoning,
  insightCellCode,
  insightTitle,
  insightSummary,
  insightSections,
  insightRecommendations
}) => {
  const messageEndRef = useRef(null);
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function updateInsightsCode(insightsCsv, insightsCode) {
    // Extract all file IDs from the insightsCode
    const fileIdMatches = insightsCode.join('\n').match(/file-[a-zA-Z0-9]+/g);
    if (!fileIdMatches) {
      console.error("No file IDs found in insightsCode");
      return insightsCode;
    }
  
    let updatedCode = [...insightsCode]; // Create a copy of the original insightsCode
    
    // Iterate through all matched file IDs
    fileIdMatches.forEach(fileId => {
      // Find the matching file_id in insightsCsv
      let matchingInsight;
      insightsCsv.forEach(insight => {
        if (insight.file_id === fileId) {
          matchingInsight = insight;
        }
      });

      if (!matchingInsight) {
        console.error(`No matching file_id '${fileId}' found in insightsCsv`);
        return; // Skip this fileId if no match is found
      }

      const tableName = matchingInsight.tableName;

      // Replace the file path in the code for each occurrence of the file ID
      updatedCode = updatedCode.map(codeLine => {
        return codeLine.replace(
          new RegExp(`('/mnt/data/${fileId}')`, 'g'),
          `'${tableName}.csv'`
        );
      });
    });
  
    return updatedCode;
}


  const downloadInsightsCode = () => {

    const updatedInsightsCode = updateInsightsCode(insightsCsv, insightsCode);

    // Structure the insightsCode as a Jupyter notebook
    const notebook = {
      nbformat: 4, // Notebook format version
      nbformat_minor: 5, // Minor version
      cells: [],
        metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3'
        },
        language_info: {
          codemirror_mode: {
            name: 'ipython',
            version: 3
          },
          file_extension: '.py',
          mimetype: 'text/x-python',
          name: 'python',
          nbconvert_exporter: 'python',
          pygments_lexer: 'ipython3',
          version: '3.8.5' // Adjust based on your Python version
        }
      }
    };

    const maxLength = Math.max(insightsText.length, updatedInsightsCode.length);

  // Loop through the maximum length to create alternating cells
  for (let i = 0; i < maxLength; i++) {
    // Add a markdown cell for insightsText if available
    if (i < insightsText.length) {
      notebook.cells.push({
        cell_type: 'markdown',
        metadata: {},
        source: insightsText[i] // Current index of insightsText
      });
    }

    // Add a code cell for insightsCode if available
    if (i < updatedInsightsCode.length) {
      notebook.cells.push({
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: updatedInsightsCode[i] // Current index of insightsCode
      });
    }
  }

    // Create a ZIP file
    const zip = new JSZip();

    // Add the notebook file to the ZIP
    const notebookBlob = JSON.stringify(notebook, null, 2);
    zip.file('insights_code.ipynb', notebookBlob);

    // Loop over the insightFile array and create CSV files
    insightFile.forEach((file) => {
      const fileName = Object.keys(file)[0]; // Extract the file name (key)
      const csvContent = file[fileName]; // Extract the CSV content (value)
      zip.file(`${fileName}.csv`, csvContent); // Add to the ZIP
    });

    // Generate the ZIP file and download it
    zip.generateAsync({ type: 'blob' }).then((content) => {
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'insights_code_and_files.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

  };
  
  

  return (
    <div
      style={{
        flexGrow: 1,
        padding: "16px",
        borderRadius: "12px 12px 0 0",
        overflowY: "auto",
      }}
    >
      {messages.map((message, index) => {
        const isLastServerMessage = 
        index === messages.length - 1 && message.sender === "server";
      
      return (
        <div key={message.id || index}>
          <Message
            message={message}
            isLoading={
              isLoading &&
              isLastServerMessage &&
              message.isLoading !== false
            }
            onFeedbackClick={onFeedbackClick}
            approvalChangeButtons={
              approvalChangeButtons &&
              message.sender === "server" &&
              message.text.startsWith("New fields")
            }
            onApproveClick={onApproveClick}
            onDenyClick={onDenyClick}
            showCubeEditButton={showCubeEditButton}
            sendAdminRequest={sendAdminRequest}
            onSuggestion={onSuggestion}
          />

          {/* Loop over insightsTables and display matching items */}
          {insightTables && insightTables.length > 0 &&
            message.showType == "tableReview" && (
              <div style={{ padding: '10px' }}>
                <TableDisplay tables={insightTables} reasoning={insightReasoning} />
              </div>
            )
          }

          {insightCellCode.map((singleCode, index) => (
            message.showType == "insightCellCode" && message.visualizationIdx === index && (
                  <div style={{ marginTop: '10px' }}>
                    <InsightCode index={index} insightCode={singleCode} />
                  </div>
            )
          ))}

          {insightTitle && insightSummary && message.showType == "insightReport" && (
            <div style={{ marginTop: '10px' }}>
              <InsightReport insightTitle={insightTitle} insightSummary={insightSummary} insightSections={insightSections} insightRecommendations={insightRecommendations} />
            </div>
          )}

          {/* Loop over insightsPlan and display matching items */}
          {insightsPlan.map((planItem, index) => (
            message.showType == "planReview" && (
              <div key={`plan-${index}`} style={{ padding: '10px' }}>
                <PlanDisplay plan={planItem} />
              </div>
            )
          ))}

          {/* Loop over insightsText and display matching items */}
          {insightsText.map((insightText, index) => (
            message.showType == "insightText" && message.visualizationIdx === index && (
              <div key={`insightText-${index}`} style={{ padding: '10px' }}>
                <InsightText index={index} insightText={insightText} />
                {insightsCode[index] && message.text.includes("Current Step:") && (
                  <div style={{ marginTop: '10px' }}>
                    <InsightCode index={index} insightCode={insightsCode[index]} />
                  </div>
                )}
                {message.text.includes("Here is your final result:") && (
                  <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button style={{ padding: '10px 20px',
                      fontSize: '16px',
                      backgroundColor: '#8A64DF',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'}} 
                      onClick={downloadInsightsCode}>Download Code</button>
                  </div>
                )}
              </div>
            )
          ))}

          {/* Loop over insightsImg and display matching items */}
          {insightsImg.map((insightImg, index) => (
            message.showType == "insightImg" && message.visualizationIdx === index && (
              <div key={`insightImg-${index}`} style={{ padding: '10px' }}>
                <InsightImg index={index} insightImg={insightImg} />
              </div>
            )
          ))}

          {/* Conditionally render visualization under the specific message */}
          {message.showVisualization && (
            <>
              {!card ? (
                <Skeleton
                  variant="rect"
                  animate={true}
                  style={{
                    flex: "1 0 50%",
                    padding: "16px",
                    overflow: "hidden",
                    height: "400px",
                    width: "auto",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {showError ? (
                    <MonospaceErrorDisplay>
                      Sorry there was some issue loading the result
                    </MonospaceErrorDisplay>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <span>Please wait till results are loaded...</span>
                      <Loader />
                    </div>
                  )}
                </Skeleton>
              ) : (
                <>
                  {card && defaultQuestion && result && (
                    <div>
                      {card.map(
                        (singleCard, cardIndex) =>
                          message.visualizationIdx === cardIndex && (
                            <div
                              key={cardIndex}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                marginBottom: "2rem",
                                height: "400px",
                                width: "auto",
                              }}
                            >
                              <div
                                style={{
                                  flex: "1 0 50%",
                                  padding: "16px",
                                  overflow: "hidden",
                                  height: "400px",
                                  width: "auto",
                                  display: "flex",
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <VisualizationResult
                                  question={defaultQuestion[cardIndex]}
                                  isDirty={false}
                                  queryBuilderMode={"view"}
                                  result={result[cardIndex]}
                                  className={cx(
                                    CS.flexFull,
                                    CS.fullWidth,
                                    CS.fullHeight,
                                  )}
                                  rawSeries={[
                                    {
                                      card: singleCard,
                                      data: result[cardIndex]?.data,
                                    },
                                  ]}
                                  isRunning={false}
                                  navigateToNewCardInsideQB={null}
                                  onNavigateBack={() => console.log("back")}
                                  timelineEvents={[]}
                                  selectedTimelineEventIds={[]}
                                />
                              </div>
                              {message.showButton === false ? (
                                <div></div>
                              ) : (
                                <Button
                                  variant="outlined"
                                  style={{
                                    width: "auto",
                                    cursor: "pointer",
                                    border: "1px solid #E0E0E0",
                                    borderRadius: "8px",
                                    marginBottom: "1rem",
                                    color: "#FFF",
                                    marginLeft: "auto",
                                    marginRight: 0,
                                    backgroundColor: "#8A64DF",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0.5rem 1rem",
                                    lineHeight: "1",
                                  }}
                                  onClick={() => openModal(singleCard, cardIndex)}
                                >
                                  <Icon
                                    size={18}
                                    name="bookmark"
                                    style={{
                                      marginRight: "0.5rem",
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: "18px",
                                      fontWeight: "lighter",
                                      verticalAlign: "top",
                                    }}
                                  >
                                    Verify & Save
                                  </span>
                                </Button>
                              )}
                            </div>
                          ),
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )})}
      <div ref={messageEndRef} />
    </div>
  );
};

export default ChatMessageList;
