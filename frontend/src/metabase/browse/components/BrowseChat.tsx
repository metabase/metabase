import { useState, useEffect } from "react";
import { Flex, Icon, Stack } from "metabase/ui";
import ChatAssistant from "metabase/query_builder/components/ChatAssistant";
import { BrowseContainer, BrowseMain } from "./BrowseContainer.styled";
import ChatHistory from "./ChatItems/ChatHistory";
import { useSelector } from "react-redux";
import { getInitialMessage } from "metabase/redux/initialMessage";
import { generateRandomId } from "metabase/lib/utils";

export const BrowseChat = () => {
  const [selectedChatHistory, setSelectedChatHistory] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [oldCardId, setOldCardId] = useState(null);
  const [insights, setInsights] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('')
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const initialMessage = useSelector(getInitialMessage);

  const handleStartNewChat = () => {
        setSelectedThreadId(null)
        setMessages([])
        setInputValue("")
        let thread_Id = generateRandomId();
        setThreadId(thread_Id)
  };

  const toggleChatHistory = () => {
    setIsChatHistoryOpen(!isChatHistoryOpen);
  };

  return (
    <BrowseContainer>
    {showButton && (
      <Flex
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          marginRight: "3rem",
          gap: "1rem", 
        }}
      >
        <button
          style={{ color: isChatHistoryOpen ? "#8A64DF" : "#76797D", cursor: "pointer", marginTop: ".2rem" }}
          onClick={toggleChatHistory}
        >
          <Icon
            name="chatHistory"
            size={18}
            style={{ fill: isChatHistoryOpen ? "#8A64DF" : "#76797D", paddingTop: "2px", paddingLeft: "2px" }}
          />
        </button>

        <button
          style={{ color: "#8A64DF", cursor: "pointer" }}
          onClick={handleStartNewChat}
        >
          <p style={{ fontSize: "14px", color: "#8A64DF", fontWeight: "500" }}>
            New Thread
            </p>
        </button>
      </Flex>
    )}
      <BrowseMain>
        <Flex style={{ height: "85vh", width: "100%" }}>
          <Stack
            mb="lg"
            spacing="xs"
            style={{
              flexGrow: 1,
              marginTop: "1rem",
              borderRight: isChatHistoryOpen ? "1px solid #e3e3e3" : "none",
            }}
          >
            <ChatAssistant
              selectedMessages={selectedChatHistory}
              selectedThreadId={selectedThreadId}
              chatType={"default"}
              oldCardId={oldCardId}
              insights={[]}
              setSelectedThreadId={setSelectedThreadId}
              initial_message={{
                message: initialMessage.message ?? ""
              }}
              setMessages={setMessages}
              setInputValue={setInputValue}
              setThreadId={setThreadId}
              threadId={threadId}
              inputValue={inputValue}
              messages={messages}
              isChatHistoryOpen={isChatHistoryOpen}
              setIsChatHistoryOpen={setIsChatHistoryOpen}
              setShowButton={setShowButton}
            />
          </Stack>
          {isChatHistoryOpen && (
            <Stack
              mb="lg"
              spacing="xs"
              style={{ minWidth: "300px", width: "300px", marginTop: "1rem" }}
            >
              <ChatHistory
                setSelectedChatHistory={setSelectedChatHistory}
                setThreadId={setSelectedThreadId}
                type="dataAgent"
                setOldCardId={setOldCardId}
                setInsights={setInsights}
              />
            </Stack>
          )}
        </Flex>
      </BrowseMain>
    </BrowseContainer>
  );
};
