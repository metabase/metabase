import { useEffect, useRef } from "react";
import Message from "./Message";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import { Button, Icon, Loader } from "metabase/ui";
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
  onSuggestion,
  card,
  defaultQuestion,
  result,
  openModal,
  showError,
  showCubeEditButton,
  sendAdminRequest,
}) => {
  const messageEndRef = useRef(null);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Get the last message that is still loading (server-side)
  const lastLoadingMessageIndex = messages.length - 1;

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
          index === lastLoadingMessageIndex && message.sender === "server" && message.isLoading;

        return (
          <div key={message.id || index}>
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
                    {card && defaultQuestion && defaultQuestion.length > 0 && result && result.length > 0 && (
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
                                    question={defaultQuestion[cardIndex]} // Ensure the question matches the visualizationIdx
                                    isDirty={false}
                                    queryBuilderMode={"view"}
                                    result={result[cardIndex]} // Ensure the result matches the visualizationIdx
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
        );
      })}
      <div ref={messageEndRef} />
    </div>
  );
};

export default ChatMessageList;
