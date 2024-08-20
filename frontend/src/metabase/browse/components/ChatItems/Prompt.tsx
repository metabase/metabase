import { useState } from "react";
import { Button, Icon } from "metabase/ui";
import Input from "metabase/core/components/Input";

const PromptGreeting = () => {
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
        Talk data to me
      </div>
      <div style={{ fontSize: "16px", color: "#5D6064" }}>
        Ask a question or make a request to get started
      </div>
    </div>
  );
};

const ChatPrompt = () => {
  const [inputValue, setInputValue] = useState("");
  const canSubmit = inputValue.length > 0;

  const handleKeyPress = (e: any) => {
    if (e.charCode === 13 && inputValue.trim()) {
      sendMessage();
    }
  };

  const sendMessage = () => {
    if (!inputValue.trim()) return;
    console.log("🚀 ~ ChatPrompt ~ inputValue:", inputValue);
  };

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {/* New Prompt Greeting */}
      <PromptGreeting />

      {/* Input and Button section */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <Input
          id="1"
          type="text"
          fullWidth
          size="large"
          placeholder="Enter a prompt here..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{ marginRight: "8px" }}
        />
        <Button
          variant="filled"
          disabled={!canSubmit}
          onClick={sendMessage}
          style={{
            borderRadius: "12px",
            padding: "0px",
            backgroundColor: !canSubmit ? "#F1EBFF" : "#8A64DF",
            color: "#FFF",
            border: "none",
          }}
        >
          <Icon
            size={26}
            style={{
              padding: "6px",
              marginTop: "4px",
              marginLeft: "4px",
              marginRight: "4px",
            }}
            name="sendChat"
          />
        </Button>
      </div>
    </div>
  );
};

export default ChatPrompt;
