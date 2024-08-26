import React from "react";
import { Icon, Button } from "metabase/ui";
import LoadingSpinner from "metabase/components/LoadingSpinner";

const Message = ({ message, isLoading, onFeedbackClick, approvalChangeButtons, onApproveClick, onDenyClick }) => {
  const isUser = message.sender === "user";
  const hasError =
    message.text.toLowerCase().includes("error") ||
    message.text.toLowerCase().includes("failed");

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
          backgroundColor: isUser
            ? "#0458DD"
            : hasError
            ? "#FFCDD2"
            : "#E9DFFF",
          borderRadius: "50%",
          color: isUser ? "#FFF" : hasError ? "#D32F2F" : "#5B26D3",
        }}
        name={isUser ? "person" : hasError ? "warning" : "chat"}
      />
      <div
        style={{
          padding: "0px 16px",
          width: "90%",
          wordWrap: "break-word",
          color: hasError ? "#D32F2F" : "#333",
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "16px", whiteSpace: "pre-wrap" }}>{message.text}</span>
        {isLoading && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <LoadingSpinner />
          </div>
        )}
        {hasError && (
          <Button
            variant="outlined"
            style={{
              cursor: "pointer",
              border: "1px solid #E0E0E0",
              borderRadius: "8px",
              color: "#F04848",
              backgroundColor: "#F6D2D2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: "auto", // Aligns the button to the right
              padding: "0.6rem 1rem",
              lineHeight: "1",
              marginRight: "10px",
              fontWeight: "bold",
            }}
            onClick={onFeedbackClick} // Trigger feedback logic
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
        )}

        {approvalChangeButtons && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              marginLeft: "auto",
            }}
          >
            <Button
              variant="outlined"
              style={{
                cursor: "pointer",
                border: "1px solid #E0E0E0",
                borderRadius: "8px",
                color: "#FFF",
                backgroundColor: "#4CAF50",
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
                border: "1px solid #E0E0E0",
                borderRadius: "8px",
                color: "#FFF",
                backgroundColor: "#F04848",
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
