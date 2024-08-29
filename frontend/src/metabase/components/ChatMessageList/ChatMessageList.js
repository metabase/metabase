import { useEffect, useRef } from "react";
import Message from "./Message";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import { Box, Button, Icon, Textarea, Loader, Flex } from "metabase/ui";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import { Skeleton } from "metabase/ui";

const ChatMessageList = ({ messages, isLoading, onFeedbackClick, approvalChangeButtons, onApproveClick, onDenyClick, card, defaultQuestion, result, openModal }) => {
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
            {card.length < 1 ? (
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
               <div style={{display:"flex", flexDirection: "column", justifyContent:"center", alignItems: "center"}}>
                <span>Please wait till results are loaded...</span>
                <Loader/>
               </div>
             </Skeleton>
             
            ):(

            
            <div>
              {card.map((singleCard, cardIndex) => (
                message.visualizationIdx === cardIndex && (
                  <div key={cardIndex} style={{ display: 'flex', flexDirection: 'column', marginBottom: '2rem', height: "400px", width: "auto" }}>
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
                className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
                rawSeries={[{ card: singleCard, data: result[cardIndex]?.data }]}
                isRunning={false}
                navigateToNewCardInsideQB={null}
                onNavigateBack={() => console.log('back')}
                timelineEvents={[]}
                selectedTimelineEventIds={[]}
                /> 

                  </div>
                  {message.showButton === false ? (
                    <div></div>
                  ):(
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
                      <span style={{ fontSize: "18px", fontWeight: "lighter", verticalAlign: "top" }}>Verify & Save</span>
                    </Button>
                  )}
                </div> 
                )
              ))}
            </div>
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
