import { useEffect, useState } from "react";
import { LayoutRoot, ContentContainer, ChatSection } from "./HomeLayout.styled";
import { ChatGreeting } from "metabase/browse/components/ChatItems/Welcome";
import { HomeInitialOptions } from "metabase/browse/components/ChatItems/InitialOptions";
import ChatPrompt from "metabase/browse/components/ChatItems/Prompt";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { push } from "react-router-redux"; // Import the push method for navigation
import {
  getInitialMessage,
  setInitialMessage,
} from "metabase/redux/initialMessage";
import { setDBInputValue, setCompanyName } from "metabase/redux/initialDb";
import ChatAssistant from "metabase/query_builder/components/ChatAssistant";
import {
  BrowseContainer,
  BrowseMain,
} from "metabase/browse/components/BrowseContainer.styled";
import { Flex, Stack, Icon } from "metabase/ui";
import ChatHistory from "metabase/browse/components/ChatItems/ChatHistory";
import { useListDatabasesQuery } from "metabase/api";
import { generateRandomId } from "metabase/lib/utils";

export const HomeLayout = () => {
  const initialMessage = useSelector(getInitialMessage);
  const [inputValue, setInputValue] = useState("");
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [selectedChatHistory, setSelectedChatHistory] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedChatType, setSelectedChatType] = useState("default");
  const [selectedChatHistoryType, setSelectedChatHistoryType] =
    useState("dataAgent");
  const [oldCardId, setOldCardId] = useState(null);
  const [insights, setInsights] = useState([]);
  const [dbId, setDbId] = useState<number | null>(null)
  const [company, setCompany] = useState<string | null>(null)
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('')
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const dispatch = useDispatch();
  const {
    data,
    isLoading: dbLoading,
    error: dbError,
  } = useListDatabasesQuery();
  const databases = data?.data;
  useEffect(() => {
    if (databases) {
      const cubeDatabase = databases.find(
        database => database.is_cube === true,
      );
      if (cubeDatabase) {
        setIsChatHistoryOpen(true);
        setShowButton(true);
        dispatch(setDBInputValue(cubeDatabase.id as number));
        dispatch(setCompanyName(cubeDatabase.company_name as string));
        setDbId(cubeDatabase.id as number)
        setCompany(cubeDatabase.company_name as string)
      }
    }
  }, [databases]);

  useEffect(() => {
    setInputValue("");
    dispatch(setInitialMessage(""));
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/") {
      setSelectedChatType("default");
      setSelectedChatHistoryType("dataAgent");
      setInsights([]);
    } else if (window.location.pathname === "/browse/insights") {
      setSelectedChatType("insights");
      setSelectedChatHistoryType("getInsights");
      setInsights(insights);
    } else if (window.location.pathname === "/browse/chat") {
      setSelectedChatType("default");
      setSelectedChatHistoryType("dataAgent");
      setInsights([]);
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
    <>
      {!showChatAssistant ? (
        <LayoutRoot data-testid="home-page">
          <ContentContainer>
            <ChatGreeting chatType={selectedChatType} />
            {/* <HomeInitialOptions /> REMOVED UNTIL FUNCTIONALITY IS COMPLETED*/}
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
                  chatType={selectedChatType}
                  oldCardId={oldCardId}
                  insights={insights}
                  setSelectedThreadId={setSelectedThreadId}
                  initial_message={initialMessage}
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
                    type={selectedChatHistoryType}
                    setOldCardId={setOldCardId}
                    setInsights={setInsights}
                  />
                </Stack>
              )}
            </Flex>
          </BrowseMain>
        </BrowseContainer>
      )}
    </>
  );
};
