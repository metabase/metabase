import React, { useEffect, useState, useRef } from "react";
import { Box, Text, ScrollArea, Title, Divider } from "metabase/ui";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import dayjs from "dayjs";

interface ChatHistoryProps {
  client: any;
  setSelectedChatHistory: (history: any) => void;
  setThreadId: (id: any) => void;
  type: string;
  setOldCardId: (id: any) => void;
  setInsights: (insights: any) => void; 
  showChatAssistant: boolean; 
  setShowChatAssistant: (value: boolean) => void; 
  shouldRefetchHistory: boolean; 
  setShouldRefetchHistory: (value: boolean) => void; 
}

const ITEMS_PER_PAGE = 30; // Number of items to load per request

interface ChatHistoryState {
  today: any[];
  last7Days: any[];
  last30Days: any[];
}

const ChatHistory = ({
  client,
  setSelectedChatHistory,
  setThreadId,
  type,
  setOldCardId,
  setInsights,
  showChatAssistant,
  setShowChatAssistant,
  shouldRefetchHistory, 
  setShouldRefetchHistory, 
}: ChatHistoryProps) => {
  const [chatHistory, setChatHistory] = useState<ChatHistoryState>({
    today: [],
    last7Days: [],
    last30Days: [],
  });

  const [createdThread, setCreatedThread] = useState<any[]>([]); // Store fetched threads
  const [offset, setOffset] = useState(0); // Track the current offset for pagination
  const [hasMore, setHasMore] = useState(true); // Track if there is more data to load
  const [loading, setLoading] = useState(true); // Add a loading state
  const scrollContainerRef = useRef<HTMLDivElement | null>(null); // Ref for scroll area
  const [activeMenu, setActiveMenu] = useState<string | null>(null); // State for showing menu

  const initializeClientAndThreads = async () => {
    try {
      setLoading(true); // Set loading to true while fetching data
      const threads = await client.threads.search();
      const filteredThreads = threads.filter(
        (thread: any) => thread.metadata && thread.metadata.graph_id === "get_data_agent"
      );
      setCreatedThread(filteredThreads);
      setLoading(false); // Set loading to false after fetching
    } catch (error) {
      console.error("Error initializing Client or fetching threads:", error);
      setLoading(false); // Set loading to false if there's an error
    }
  };

  useEffect(() => {
    initializeClientAndThreads();
  }, []);

  // Refetch threads when `shouldRefetchHistory` is true
  useEffect(() => {
    if (shouldRefetchHistory) {
      initializeClientAndThreads(); // Refetch threads
      setShouldRefetchHistory(false); // Reset the flag after refetching
    }
  }, [shouldRefetchHistory, setShouldRefetchHistory]);

  useEffect(() => {
    if (createdThread && createdThread.length > 0) {
      const today = dayjs().startOf("day");
      const last7Days = dayjs().subtract(7, "day").startOf("day");
      const last30Days = dayjs().subtract(30, "day").startOf("day");

      const categorizedHistory: ChatHistoryState = {
        today: [],
        last7Days: [],
        last30Days: [],
      };

      createdThread.forEach((thread: any) => {
        const timestamp = dayjs(thread.created_at);

        if (timestamp.isSame(today, "day")) {
          categorizedHistory.today.push(thread);
        } else if (timestamp.isAfter(last7Days)) {
          categorizedHistory.last7Days.push(thread);
        } else if (timestamp.isAfter(last30Days)) {
          categorizedHistory.last30Days.push(thread);
        }
      });

      setChatHistory((prevHistory) => ({
        today: [...prevHistory.today, ...categorizedHistory.today],
        last7Days: [...prevHistory.last7Days, ...categorizedHistory.last7Days],
        last30Days: [...prevHistory.last30Days, ...categorizedHistory.last30Days],
      }));

      if (createdThread.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }
    }
  }, [createdThread]);

  // Handle scrolling to bottom to load more items
  const handleScroll = () => {
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    if (scrollHeight - scrollTop === clientHeight && hasMore) {
      setOffset((prevOffset) => prevOffset + ITEMS_PER_PAGE); // Load the next batch
    }
  };

  useEffect(() => {
    const scrollElement = scrollContainerRef.current;
    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
      return () => {
        scrollElement.removeEventListener("scroll", handleScroll);
      };
    }
  }, [hasMore]);

  const handleHistoryItemClick = async (item: any) => {
    try {
      // Fetch the selected thread's history using client.threads.getHistory
      const selectedThread = await client.threads.getHistory(item.thread_id);

      if (selectedThread.length > 0 && selectedThread[0].values) {
        const threadMessages = selectedThread[0].values.messages || [];
        let extractedCardId = null; // Initialize to store the card_id

        // Iterate over threadMessages to find the card_id
        for (const message of threadMessages) {
          // Check if message content includes 'card_id'
          if (message.content && message.content.includes('"card_id"')) {
            try {
              const parsedContent = JSON.parse(message.content);
              if (parsedContent.card_id) {
                extractedCardId = parsedContent.card_id;
                break; // Stop once the card_id is found
              }
            } catch (error) {
              console.error("Error parsing message content:", error);
            }
          }
        }

        const insights = item.insights || []; // Extract insights (if any)

        // Reset necessary state values
        setThreadId(null);
        setSelectedChatHistory([]);
        setOldCardId([]);

        // Set the thread ID, messages, and insights
        setThreadId(item.thread_id); // Set the selected thread id
        setSelectedChatHistory(threadMessages); // Set the messages from selected thread
        setOldCardId(extractedCardId); // Set the extracted card ID

        // If it's an insight type, set the insights
        if (item.type === "getInsights" && insights.length > 0) {
          setInsights(insights);
        }

        if (!showChatAssistant) {
          setShowChatAssistant(true);
        }
      } else {
        console.error("No messages found in the selected thread.");
      }
    } catch (error) {
      console.error("Error fetching thread history:", error);
    }
  };

  return (
    <Box
      style={{
        backgroundColor: "#FFF",
        borderRadius: "8px",
        padding: "16px",
        height: "82vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Title
        order={4}
        style={{ marginBottom: "16px", color: "#76797D", fontSize: "16px" }}
      >
        Chat history
      </Title>

      {/* Show loading spinner at the top if data is being loaded */}
      {loading && (
        <Box style={{ display: "flex", textAlign: "center", marginBottom: "1rem", width: "100%" }}>
          <LoadingSpinner />
        </Box>
      )}

      {/* Only show this message if no data was fetched */}
      {!loading && chatHistory.today.length === 0 &&
        chatHistory.last7Days.length === 0 &&
        chatHistory.last30Days.length === 0 && (
          <Text style={{ textAlign: "center", color: "#76797D", marginBottom: "1rem" }}>
            No chat history available
          </Text>
        )}

      <ScrollArea ref={scrollContainerRef} style={{ flex: 1 }}>
        {chatHistory.today.length > 0 && (
          <>
            <Text
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                color: "#8F9296",
                fontSize: "14px",
              }}
            >
              Today
            </Text>
            {chatHistory.today.map((chat: any, index: number) => (
              <Box
                key={`${chat.thread_id}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  cursor: "pointer",
                  paddingRight: "2rem"
                }}
              >
                <Text
                  style={{ color: "#76797d" }}
                  onClick={() => handleHistoryItemClick(chat)}
                >
                  {chat.values?.messages?.[0]?.content || chat.thread_id}
                </Text>
              </Box>
            ))}
            <Divider my="sm" />
          </>
        )}

        {chatHistory.last7Days.length > 0 && (
          <>
            <Text
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                color: "#8F9296",
                fontSize: "14px",
              }}
            >
              Last 7 Days
            </Text>
            {chatHistory.last7Days.map((chat: any, index: number) => (
              <Box
                key={`${chat.thread_id}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  cursor: "pointer",
                  paddingRight: "2rem"
                }}
              >
                <Text
                  style={{ color: "#76797d" }}
                  onClick={() => handleHistoryItemClick(chat)}
                >
                  {chat.values?.messages?.[0]?.content || chat.thread_id}
                </Text>
              </Box>
            ))}
            <Divider my="sm" />
          </>
        )}

        {chatHistory.last30Days.length > 0 && (
          <>
            <Text
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                color: "#8F9296",
                fontSize: "14px",
              }}
            >
              Last 30 Days
            </Text>
            {chatHistory.last30Days.map((chat: any, index: number) => (
              <Box
                key={`${chat.thread_id}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  cursor: "pointer",
                  paddingRight: "2rem"
                }}
              >
                <Text
                  style={{ color: "#76797d" }}
                  onClick={() => handleHistoryItemClick(chat)}
                >
                  {chat.values?.messages?.[0]?.content || chat.thread_id}
                </Text>
              </Box>
            ))}
          </>
        )}
      </ScrollArea>
    </Box>
  );
};

export default ChatHistory;
