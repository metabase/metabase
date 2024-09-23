import { useRef, useEffect } from "react";
import { Button, Icon } from "metabase/ui";
import TextArea from "metabase/core/components/TextArea";
import { t } from "ttag";

const PromptGreeting = ({ chatType }: any) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "start",
        flexDirection: "column",
        gap: "6px",
        marginBottom: "16px",
      }}
    >
      <div style={{ fontSize: "20px", color: "#5B26D3", fontWeight: "bolder" }}>
        {chatType === "insights"
          ? t`Ask a question to get started`
          : t`Ask a question or make a request to get started`}
      </div>
    </div>
  );
};

const ChatPrompt = ({
  chatType,
  inputValue = "",
  setInputValue,
  onSendMessage,
}: any) => {
  const inputRef = useRef<any>(null);
  const canSubmit = inputValue.length > 0;

  const handleKeyPress = (e: any) => {
    if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
      e.preventDefault(); // Prevent creating a new line
      onSendMessage();
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "100px"; // Set a minimum height
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`; // Adjust the height based on content
    }
  }, [inputValue]);

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {/* New Prompt Greeting */}
      <PromptGreeting chatType={chatType} />

      {/* Input and Button section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px",
          border: "1px solid #E0E0E0",
          borderRadius: "8px",
          backgroundColor: "#F8FAFD",
          position: "relative", // Make the parent relative to position the button inside
        }}
      >
        <TextArea
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t`Enter a prompt here...`}
          style={{
            width: "100%",
            resize: "none",
            overflowY: "auto",
            minHeight: "100px",
            maxHeight: "220px",
            padding: "12px",
            paddingRight: "60px", // Space for the send button
            lineHeight: "24px",
            border: "none",
            outline: "none",
            boxSizing: "border-box",
            borderRadius: "8px",
            backgroundColor: "transparent",
          }}
        />
        <Button
          variant="filled"
          disabled={!canSubmit}
          onClick={onSendMessage}
          style={{
            position: "absolute",
            right: "10px",
            bottom: "10px",
            borderRadius: "8px",
            width: "30px",
            height: "30px",
            padding: "0",
            minWidth: "0",
            backgroundColor: canSubmit ? "#8A64DF" : "#F1EBFF",
            color: "#FFF",
            border: "none",
            cursor: canSubmit ? "pointer" : "not-allowed",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon
            size={18}
            name="sendChat"
            style={{ paddingTop: "2px", paddingLeft: "2px" }}
          />
        </Button>
      </div>
    </div>
  );
};

export default ChatPrompt;
