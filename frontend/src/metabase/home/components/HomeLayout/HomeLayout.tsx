import { useEffect, useMemo, useState } from "react";
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
import { setDBInputValue, setCompanyName, setInsightDBInputValue, getDBInputValue } from "metabase/redux/initialDb";
import { setInitialSchema } from "metabase/redux/initialSchema";
import ChatAssistant from "metabase/query_builder/components/ChatAssistant";
import {
  BrowseContainer,
  BrowseMain,
} from "metabase/browse/components/BrowseContainer.styled";
import { Flex, Stack, Icon } from "metabase/ui";
import ChatHistory from "metabase/browse/components/ChatItems/ChatHistory";
import { useListDatabasesQuery, useGetDatabaseMetadataWithoutParamsQuery, skipToken } from "metabase/api";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { generateRandomId } from "metabase/lib/utils";
import useWebSocket from "metabase/hooks/useWebSocket";
import { t } from "ttag";
import { getSuggestions, setSuggestions } from "metabase/redux/suggestionsSlice";
import { NoDatabaseError, SemanticError } from "metabase/components/ErrorPages";

export const HomeLayout = () => {
  const initialMessage = useSelector(getInitialMessage);
  const suggestions = useSelector(getSuggestions);
  const [inputValue, setInputValue] = useState("");
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [selectedChatHistory, setSelectedChatHistory] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedChatType, setSelectedChatType] = useState("default");
  const [selectedChatHistoryType, setSelectedChatHistoryType] =
    useState("dataAgent");
  const [oldCardId, setOldCardId] = useState(null);
  const [insights, setInsights] = useState([]);
  const [hasDatabases, setHasDatabases] = useState<boolean>(false)
  const [dbId, setDbId] = useState<number | null>(null)
  const [company, setCompany] = useState<string | null>(null)
  const [schema, setSchema] = useState<any[]>([]);
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState('')
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const assistant_url = process.env.REACT_APP_WEBSOCKET_SERVER;

  const dispatch = useDispatch();
  const {
    data,
    isLoading: dbLoading,
    error: dbError,
  } = useListDatabasesQuery();
  const databases = data?.data;
  useMemo(() => {
    if (databases) {
      setHasDatabases(databases.length > 0)
      const cubeDatabase = databases.find(
        database => database.is_cube === true,
      );
      /*const rawDatabase = databases.find(database => database.is_cube === false);
      if (rawDatabase) {
          setDatabaseId(rawDatabase.id)
      }*/
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

  const {
    data: databaseMetadata,
    isLoading: databaseMetadataIsLoading,
    error: databaseMetadataIsError
  } = useGetDatabaseMetadataWithoutParamsQuery(
    dbId !== null
      ? { id: dbId }
      : skipToken
  );
  const databaseMetadataData = databaseMetadata;
  useEffect(() => {
    console.log({databaseMetadataData})
    if (databaseMetadataData && Array.isArray(databaseMetadataData.tables)) {
      const schema = databaseMetadata.tables?.map((table: any) => ({
        display_name: table.display_name,
        id: table.id,
        fields: table.fields.map((field: any) => ({
          id: field.id,
          name: field.name,
          fieldName: field.display_name,
          description: field.description,
          details: field.fingerprint ? JSON.stringify(field.fingerprint) : null
        }))
      }));
      dispatch(setInitialSchema(schema as any))
      setSchema(schema as any)
    }
  }, [databaseMetadataData]);

  useEffect(() => {
    setInputValue("");
    dispatch(setInitialMessage(""));
  }, []);

  useEffect(() => {

    setInputValue("");
    dispatch(setInitialMessage(""));
    setShowChatAssistant(false);

    if (window.location.pathname === "/browse/insights") {
      setSelectedChatType("insights");
      setSelectedChatHistoryType("getInsights");
      setInsights(insights);
      return;
    }

    // "/" ||  "/browse/chat"
    setSelectedChatType("default");
    setSelectedChatHistoryType("dataAgent");
    setInsights([]);

  }, [window.location.pathname]);

  const { ws, isConnected } = useWebSocket(
    assistant_url,
    async (e: any) => {
      if (e.data) {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case "tool":
            await handleFunctionalityMessages(data.functions);
            break;
          default:
            break;
        }
      }
    },
    () => console.error("WebSocket error"),
    () => console.log("WebSocket closed"),
    () => console.log("WebSocket opened"),
  );


  const handleFunctionalityMessages = async (functions: any[]) => {
    functions.forEach(async func => {
      switch (func.function_name) {
        case "getSuggestions":
          console.log(func.arguments.suggestions);
          dispatch(setSuggestions(func.arguments.suggestions));
          break;
        default:
          console.log(func);
          break;
      }
    });
  };

  useEffect(() => {
    //TODO: No se hace el envio si no tiene suggestion ni schemas
    if (isConnected && !suggestions.suggestions && schema.length > 0) {
      ws.send(
        JSON.stringify({
          type: "getSuggestions",
          appType: selectedChatType, //No hará falta porque cargaremos las dos de golpe
          schema: schema,
        }),
      );
    }
  }, [isConnected, suggestions, schema, selectedChatType]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    dispatch(setInitialMessage(inputValue)); // Set the initial message in Redux
    setShowChatAssistant(true);

    setInputValue(""); // Clear the input value
  };

  const handleSuggestionClick = (message: string) => {
    dispatch(setInitialMessage(message)); // Set the initial message from the card in Redux

    setShowChatAssistant(true);
    setInputValue(""); // Clear the input value if needed (or skip this line)
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
        <>
          {!hasDatabases ? (
            <NoDatabaseError />
          ) : (
            <>
              {!dbId && window.location.pathname === "/browse/chat" ? <SemanticError details={undefined} /> :
                <LayoutRoot data-testid="home-page">
                  <ContentContainer>
                    <ChatGreeting chatType={selectedChatType} />
                    {suggestions.suggestions ? (
                      <HomeInitialOptions suggestions={suggestions.suggestions} chatType={selectedChatType} onClick={handleSuggestionClick} />
                    ) : (
                      // Mientras no haya sugerencias, mostramos un mensaje de carga
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                          <p style={{ fontSize: "16px", color: "#76797D", fontWeight: "500", marginBottom: "1rem" }}>
                            {t`Loading suggestions...`}
                          </p>
                          <LoadingSpinner />
                        </div>
                      </div>
                    )}
                  </ContentContainer>
                  {schema.length > 0 ? (
                    <ChatSection>
                      <ChatPrompt
                        chatType={selectedChatType}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                        onSendMessage={handleSendMessage}
                      />
                    </ChatSection>
                  ) : (
                    <ChatSection>
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                          <p style={{ fontSize: "16px", color: "#76797D", fontWeight: "500", marginBottom: "1rem" }}>
                            Please Wait while we initialize the chat
                          </p>
                          <LoadingSpinner />
                        </div>
                      </div>
                    </ChatSection>
                  )}
                </LayoutRoot>
              }
            </>

          )}
        </>
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

