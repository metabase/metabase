import { useEffect, useRef, useState } from "react";
import Message from "./Message";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import { Button, Icon, Loader } from "metabase/ui";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import { MonospaceErrorDisplay } from "../ErrorDetails/ErrorDetails.styled";
import { Skeleton } from "metabase/ui";
import { InsightImg } from "metabase/components/Insight/InsightImg";
import { PlanDisplay } from "../Insight/InsightPlan";
import { highlightCode, styles } from "../Insight/utils";
import ReactMarkdown from 'react-markdown';

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
  showError,
  insightsCode,
  showCubeEditButton,
  sendAdminRequest,
  insightsImg,
  insightsPlan,
  progressShow,
  insightsText,
  finalMessages,
  finalMessagesText
}) => {
  const messageEndRef = useRef(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleShowCode = () => {
    setShowCode(!showCode);
  }

  const formattedInsightText = finalMessagesText.join('\n\n');
  let formattedInsightResult = '';
  if (finalMessages.length > 0) {
    formattedInsightResult = finalMessages[0].text;
  }
  const formattedInsightsCode = insightsCode.join('\n\n');

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
          index === messages.length - 1 && message.sender === "server" && message.isLoading;

        // Extract the message visualization index
        const visualizationIdx = message.visualizationIdx;

        return (
          <div key={message.id || index}>
            {message.text !== "" && (
              <Message
                message={message}
                isLoading={isLastServerMessage}
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
            )}

            {progressShow && (
              <div
                key={`insightWrapper-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '20px',
                  padding: '10px'
                }}
              >
                <div style={{ flex: '1' }}>
                  {insightsPlan.map((planItem, planIndex) => (
                    message.showType === "insightProgress" && (
                      <div key={`plan-${planIndex}`}>
                        <PlanDisplay plan={planItem} index={planIndex} />
                      </div>
                    )
                  ))}
                  {message.showType === "insightProgress" && formattedInsightResult !== '' && (
                    <div style={{
                      textAlign: 'right',
                      height: '400px',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      border: '1px solid #ccc',
                      borderRadius: '5px',
                      position: 'relative',
                      padding: '10px',
                    }}>
                      <div style={styles.insightTextWrapper}>
                        <ReactMarkdown>{formattedInsightResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
                {message.showType === "insightProgress" && (
                  <div style={{ flex: '1' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                      {insightsText.length > 0 && (
                        <div style={{
                          textAlign: 'right',
                          height: '400px',
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          border: '1px solid #ccc',
                          borderRadius: '5px',
                          position: 'relative',
                          padding: '10px',
                        }}>
                          {/* Show Code Button */}
                          <button style={{
                            padding: '5px 10px',
                            fontSize: '14px',
                            backgroundColor: 'white',
                            color: '#587330',
                            borderRadius: '5px',
                            cursor: 'pointer'
                          }} onClick={handleShowCode}>
                            {showCode ? 'Show Text' : 'Show Code'} &nbsp;&nbsp;<Icon name="chevronright" size={14} />
                          </button>

                          {!showCode ? (
                            <div style={styles.insightTextWrapper}>
                              <ReactMarkdown>{formattedInsightText}</ReactMarkdown>
                            </div>
                          ) : (
                            <div style={styles.stepContainer}>
                              <pre style={styles.codeBlock}>
                                {highlightCode(formattedInsightsCode)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                      {insightsImg.length > 0 && (
                        <div style={{
                          textAlign: 'right',
                          height: '400px',
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          border: '1px solid #ccc',
                          borderRadius: '5px',
                          position: 'relative',
                          padding: '10px',
                          marginTop: '10px',
                        }}>
                          {insightsImg.map((insightImg, imgIndex) => (
                            <div key={`insightImg-${imgIndex}`} style={{ padding: '10px' }}>
                              <InsightImg index={imgIndex} insightImg={insightImg} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Display visualization only for this message's card */}
            {message.showVisualization && visualizationIdx !== undefined && (
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
                    {/* Render only the card for the current visualization index */}
                    {card && defaultQuestion.length > visualizationIdx && result.length > visualizationIdx && (
                      <div key={`card-${visualizationIdx}`} style={{ display: "flex", flexDirection: "column", marginBottom: "2rem", height: "400px", width: "auto" }}>
                        <div style={{ flex: "1 0 50%", padding: "16px", overflow: "hidden", height: "400px", width: "auto", display: "flex", justifyContent: "center", alignItems: "center" }}>
                          <VisualizationResult
                            question={defaultQuestion[visualizationIdx]}
                            isDirty={false}
                            queryBuilderMode={"view"}
                            result={result[visualizationIdx]}
                            className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
                            rawSeries={[{ card: card[visualizationIdx], data: result[visualizationIdx]?.data }]}
                            isRunning={false}
                          />
                        </div>

                        <Button
                          variant="outlined"
                          style={{ width: "auto", cursor: "pointer", border: "1px solid #E0E0E0", borderRadius: "8px", marginBottom: "1rem", color: "#FFF", marginLeft: "auto", marginRight: 0, backgroundColor: "#8A64DF", display: "flex", alignItems: "center", padding: "0.5rem 1rem", lineHeight: "1" }}
                          onClick={() => openModal(card[visualizationIdx], visualizationIdx)}
                        >
                          <Icon size={18} name="bookmark" style={{ marginRight: "0.5rem" }} />
                          <span style={{ fontSize: "18px", fontWeight: "lighter" }}>Verify & Save</span>
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
      <div ref={messageEndRef} />
    </div>
  );
};

export default ChatMessageList;
