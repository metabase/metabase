import React from "react";
import { Icon, Button } from "metabase/ui";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import ReactMarkdown from 'react-markdown';

const Message = ({
  message,
  isLoading,
  onFeedbackClick,
  sendAdminRequest,
  approvalChangeButtons,
  onApproveClick,
  onDenyClick,
  onSuggestion,
  showCubeEditButton,
}) => {
  const isUser = message.sender === "user";
  let hasError = false;
  if (message.typeMessage === "error") {
    hasError = true;
  }

  // Function to handle rendering text from message
  const renderMessageContent = (message) => {
    if (Array.isArray(message.text)) {
      return message.text
        .filter((item) => typeof item === "object" && item.text && item.text.trim().length > 0)
        .map((item, index) => (
          <ReactMarkdown key={index}>{item.text}</ReactMarkdown>
        ));
    } else if (typeof message.text === "object" && message.text.text && message.text.text.trim().length > 0) {
      return <ReactMarkdown>{message.text.text}</ReactMarkdown>;
    } else if (typeof message.text === "string" && message.text.trim().length > 0) {
      return <ReactMarkdown>{message.text}</ReactMarkdown>;
    }
    return null;
  };
  

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginBottom: "16px",
      }}
    >
      <Icon
        size={24}
        style={{
          marginTop: "4px",
          marginBottom: "auto",
          padding: "6px",
          backgroundColor: isUser ? "#0458DD" : hasError ? "#FFCDD2" : "#E9DFFF",
          borderRadius: "50%",
          color: isUser ? "#FFF" : hasError ? "#D32F2F" : "#5B26D3",
        }}
        name={isUser ? "person" : hasError ? "warning" : "chat"}
      />
      <div
        style={{
          padding: "0px 16px",
          width: "95%",
          wordWrap: "break-word",
          color: hasError ? "#D32F2F" : "#333",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        {/* Render the message content */}
        <span style={{ fontSize: "16px", whiteSpace: "pre-wrap", paddingRight: "2rem" }}>
        {renderMessageContent(message)}
        </span>
        {isLoading && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              marginLeft: "2rem"
            }}
          >
            <LoadingSpinner />
          </div>
        )}
        {hasError && (
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              flexDirection: "row",
              gap: "1rem",
            }}
          >
            <Button
              variant="outlined"
              style={{
                cursor: "pointer",
                border: "1px solid #587330",
                borderRadius: "8px",
                color: "#587330",
                backgroundColor: "#FFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.3rem 0.8rem",
                lineHeight: "1",
                fontWeight: "bold",
                width: "10rem",
              }}
              onClick={onFeedbackClick}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "lighter",
                  verticalAlign: "middle",
                }}
              >
                Provide feedback
              </span>
            </Button>
              {message.showSuggestionButton !== false && (
              <Button
                variant="outlined"
                style={{
                  cursor: "pointer",
                  border: "1px solid #587330",
                  borderRadius: "8px",
                  color: "#587330",
                  backgroundColor: "#FFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.3rem 0.8rem",
                  lineHeight: "1",
                  fontWeight: "bold",
                  width: "10rem",
                }}
                onClick={onSuggestion}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "lighter",
                    verticalAlign: "middle",
                  }}
                >
                  Ask Suggestion
                </span>
              </Button>
              )}
            {showCubeEditButton && (
              <Button
                variant="outlined"
                style={{
                  cursor: "pointer",
                  border: "1px solid #587330",
                  borderRadius: "8px",
                  color: "#587330",
                  backgroundColor: "#FFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.3rem 0.8rem",
                  lineHeight: "1",
                  fontWeight: "bold",
                  width: "13rem",
                }}
                onClick={sendAdminRequest}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "lighter",
                    verticalAlign: "middle",
                  }}
                >
                  Ask admin to add definition
                </span>
              </Button>
            )}
          </div>
        )}

        {approvalChangeButtons && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              marginLeft: "auto",
              marginTop: "8px",
            }}
          >
            <Button
              variant="outlined"
              style={{
                cursor: "pointer",
                border: "1px solid #587330",
                borderRadius: "8px",
                color: "#FFF",
                backgroundColor: "#587330",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.6rem 1rem",
                lineHeight: "1",
                marginRight: "10px",
                fontWeight: "bold",
              }}
              onClick={onApproveClick}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "lighter",
                  verticalAlign: "middle",
                }}
              >
                Accept
              </span>
            </Button>

            <Button
              variant="outlined"
              style={{
                cursor: "pointer",
                border: "1px solid #587330",
                borderRadius: "8px",
                color: "#587330",
                backgroundColor: "#FFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.6rem 1rem",
                lineHeight: "1",
                fontWeight: "bold",
              }}
              onClick={onDenyClick}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "lighter",
                  verticalAlign: "middle",
                }}
              >
                Deny
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;
