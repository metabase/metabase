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
  sendAdminRequest
}) => {
  const messageEndRef = useRef(null);
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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
                {insightsCode[index] && (
                  <div style={{ marginTop: '10px' }}>
                    <InsightCode index={index} insightCode={insightsCode[index]} />
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
