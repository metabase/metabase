import { useEffect, useRef } from "react";
import Message from "./Message";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import { Box, Button, Icon, Textarea, Loader, Flex } from "metabase/ui";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import { MonospaceErrorDisplay } from "../ErrorDetails/ErrorDetails.styled";
import { Skeleton } from "metabase/ui";

const ChatMessageList = ({
  messages,
  isLoading,
  onFeedbackClick,
  approvalChangeButtons,
  onApproveClick,
  onDenyClick,
  card,
  defaultQuestion,
  result,
  openModal,
  insightsList,
  showError,
  openInsightModal,
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
      {messages.map((message, index) => (
        <div key={message.id || index}>
          <Message
            message={message}
            isLoading={
              isLoading &&
              message.sender === "server" &&
              message.text === "Please wait until we generate the response...."
            }
            onFeedbackClick={onFeedbackClick}
            approvalChangeButtons={
              approvalChangeButtons &&
              message.sender === "server" &&
              message.text.startsWith("New fields")
            }
            onApproveClick={onApproveClick}
            onDenyClick={onDenyClick}
          />

          {/* Conditionally render visualization under the specific message */}
          {message.showVisualization && card && defaultQuestion && result && (
            <>
              {card.length < 1 && insightsList.length < 1 ? (
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
                  {insightsList.length < 1 ? (
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
                                  onClick={() => openModal(cardIndex)}
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
                  ) : (
                    <>
                      {insightsList && insightsList.length > 0 && (
                        <div>
                          {insightsList.map(
                            (insightList, insightIndex) =>
                              message.visualizationIdx === insightIndex && (
                                <div style={{ marginTop: "2rem" }}>
                                  <h2 style={{ marginBottom: "1rem" }}>
                                    Insights
                                  </h2>
                                  {insightList.map((insight, index) => (
                                    <div
                                      key={index}
                                      style={{ marginBottom: "2rem" }}
                                    >
                                      {insight.insightExplanation && (
                                        <div style={{ marginBottom: "1rem" }}>
                                          <strong>Insight:</strong>{" "}
                                          {insight.insightExplanation}
                                        </div>
                                      )}
                                      {!insight.type ? (
                                        <div
                                          style={{
                                            padding: "16px",
                                            overflow: "hidden",
                                            height: "400px",
                                            width: "auto",
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            border: "1px solid #E0E0E0",
                                            borderRadius: "8px",
                                            backgroundColor: "#F8FAFD",
                                          }}
                                        >
                                          <VisualizationResult
                                            question={insight.defaultQuestion}
                                            isDirty={false}
                                            queryBuilderMode={"view"}
                                            result={insight.queryCard}
                                            className={cx(
                                              CS.flexFull,
                                              CS.fullWidth,
                                              CS.fullHeight,
                                            )}
                                            rawSeries={[
                                              {
                                                card: insight.card,
                                                data:
                                                  insight.queryCard &&
                                                  insight.queryCard.data,
                                              },
                                            ]}
                                            isRunning={false}
                                            navigateToNewCardInsideQB={null}
                                            onNavigateBack={() =>
                                              console.log("back")
                                            }
                                            timelineEvents={[]}
                                            selectedTimelineEventIds={[]}
                                          />
                                        </div>
                                      ) : (
                                        <div>
                                          {insight.type === "image" &&
                                            insight.base64 && (
                                              <img
                                                src={`data:image/png;base64,${insight.base64}`}
                                                alt="Insight Visualization"
                                                style={{
                                                  maxHeight: "100%",
                                                  maxWidth: "100%",
                                                }}
                                              />
                                            )}
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
                                            onClick={() =>
                                              openInsightModal(index)
                                            }
                                          >
                                            <span
                                              style={{
                                                fontSize: "18px",
                                                fontWeight: "lighter",
                                                verticalAlign: "top",
                                              }}
                                            >
                                              Verify Code
                                            </span>
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ),
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      ))}
      <div ref={messageEndRef} />
    </div>
  );
};

export default ChatMessageList;
