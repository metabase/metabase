import React from "react";
import { Icon } from "metabase/ui";

const Message = ({ message }) => {
  const isUser = message.sender === "user";

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
          padding: "2px",
        }}
        name={isUser ? "person" : "chat"}
      />
      <div
        style={{
          padding: "0px 16px",
          width: "90%",
          wordWrap: "break-word",
          color: "#333",
        }}
      >
        <span style={{ fontSize: "16px" }}>{message.text}</span>
      </div>
    </div>
  );
};

export default Message;
