import { useEffect, useState } from "react";
import { LayoutRoot, ContentContainer, ChatSection } from "./HomeLayout.styled";
import { ChatGreeting } from "metabase/browse/components/ChatItems/Welcome";
import { HomeInitialOptions } from "metabase/browse/components/ChatItems/InitialOptions";
import ChatPrompt from "metabase/browse/components/ChatItems/Prompt";
import { useDispatch } from "metabase/lib/redux";
import { push } from "react-router-redux"; // Import the push method for navigation
import { setInitialMessage } from "metabase/redux/initialMessage";
import ChatAssistant from "metabase/query_builder/components/ChatAssistant";
import {
  BrowseContainer,
  BrowseMain,
} from "metabase/browse/components/BrowseContainer.styled";
import { Flex, Stack } from "metabase/ui";
import ChatHistory from "metabase/browse/components/ChatItems/ChatHistory";

export const HomeLayout = () => {
  const [inputValue, setInputValue] = useState("");
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [selectedChatHistory, setSelectedChatHistory] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedChatType, setSelectedChatType] = useState("default");
  const [selectedChatHistoryType, setSelectedChatHistoryType] = useState("dataAgent");
  const [oldCardId, setOldCardId] = useState(null);
  const dispatch = useDispatch();

  useEffect(() => {
    setInputValue("");
    dispatch(setInitialMessage(""));
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/") {
      setSelectedChatType("default");
      setSelectedChatHistoryType("dataAgent")
    } else if (window.location.pathname === "/browse/insights") {
      setSelectedChatType("insights");
      setSelectedChatHistoryType("getInsights")
    } else if (window.location.pathname === "/browse/chat") {
      setSelectedChatType("default");
      setSelectedChatHistoryType("dataAgent")
    }
  }, [window.location.pathname]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    dispatch(setInitialMessage(inputValue)); // Set the initial message in Redux

    if (window.location.pathname === "/") {
      dispatch(push("/browse/chat")); // Navigate to /browse/chat
    } else if (window.location.pathname === "/browse/insights") {
      setShowChatAssistant(true); // Show the ChatAssistant component
    }

    setInputValue(""); // Clear the input value
  };

  return (
    <>
      {!showChatAssistant ? (
        <LayoutRoot data-testid="home-page">
          <ContentContainer>
            <ChatGreeting chatType={selectedChatType} />
            <HomeInitialOptions />
          </ContentContainer>
          <ChatSection>
            <ChatPrompt
              chatType={selectedChatType}
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSendMessage={handleSendMessage}
            />
          </ChatSection>
        </LayoutRoot>
      ) : (
        <BrowseContainer>
          <BrowseMain>
            <Flex style={{ height: "100%", width: "100%" }}>
              <Stack
                mb="lg"
                spacing="xs"
                style={{
                  flexGrow: 1,
                  marginTop: "1rem",
                  borderRight: "1px solid #e3e3e3",
                }}
              >
                <ChatAssistant
                  selectedMessages={selectedChatHistory}
                  selectedThreadId={selectedThreadId}
                  chatType={selectedChatType}
                  oldCardId={oldCardId}
                />
              </Stack>
              <Stack
                mb="lg"
                spacing="xs"
                style={{ minWidth: "300px", width: "300px", marginTop: "1rem" }}
              >
                <ChatHistory
                  setSelectedChatHistory={setSelectedChatHistory}
                  setThreadId={setSelectedThreadId}
                  type={selectedChatHistoryType}
                  setOldCardId={setOldCardId}
                />
              </Stack>
            </Flex>
          </BrowseMain>
        </BrowseContainer>
      )}
    </>
  );
};
