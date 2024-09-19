import React from "react";
import { Icon, Button } from "metabase/ui";
import LoadingSpinner from "metabase/components/LoadingSpinner";

const Message = ({
  message,
  isLoading,
  onFeedbackClick,
  sendAdminRequest,
  approvalChangeButtons,
  onApproveClick,
  onDenyClick,
  showCubeEditButton
}) => {
  const isUser = message.sender === "user";
  let hasError = false
  if (message.typeMessage === "error") {
    hasError = true
  }
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
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: "16px", whiteSpace: "pre-wrap" }}>
          {message.text}
        </span>
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
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "row", gap: "1rem" }}>
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
