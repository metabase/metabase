import React from "react";
import { Icon } from "metabase/ui";
import LoadingSpinner from "metabase/components/LoadingSpinner";

const Message = ({ message, isLoading }) => {
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
        }}
      >
        <span style={{ fontSize: "16px" }}>{message.text}</span>
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
      </div>
    </div>
  );
};

export default Message;
