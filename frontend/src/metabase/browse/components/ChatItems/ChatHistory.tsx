import React, { useEffect, useState, useRef } from "react";
import { Box, Text, ScrollArea, Title, Divider } from "metabase/ui";
import { Client } from "@langchain/langgraph-sdk"; 
import dayjs from "dayjs";

interface ChatHistoryProps {
  setSelectedChatHistory: (history: any) => void;
  setThreadId: (id: any) => void;
  type: string;
  setOldCardId: (id: any) => void;
  setInsights: (insights: any) => void; // Optional prop
}

const ITEMS_PER_PAGE = 30; // Number of items to load per request

interface ChatHistoryState {
  today: any[];
  last7Days: any[];
  last30Days: any[];
}

const ChatHistory = ({
  setSelectedChatHistory,
  setThreadId,
  type,
  setOldCardId,
  setInsights,
}: ChatHistoryProps) => {
  const [chatHistory, setChatHistory] = useState<ChatHistoryState>({
    today: [],
    last7Days: [],
    last30Days: [],
  });

  const langchain_url = "https://assistants-dev-7ca2258c0a7e5ea393441b5aca30fb7c.default.us.langgraph.app";
  const langchain_key = "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";
  const [createdThread, setCreatedThread] = useState<any[]>([]); // Store fetched threads
  const [client, setClient] = useState<any>(null)
  const [offset, setOffset] = useState(0); // Track the current offset for pagination
  const [hasMore, setHasMore] = useState(true); // Track if there is more data to load
  const scrollContainerRef = useRef<HTMLDivElement | null>(null); // Ref for scroll area

  // Fetch paginated threads from the API
  useEffect(() => {
    const initializeClientAndThreads = async () => {
      try {
        const clientInstance = new Client();
        setClient(clientInstance)
        const threads = await clientInstance.threads.search();
        
        setCreatedThread(threads);
      } catch (error) {
        console.error("Error initializing Client or fetching threads:", error);
      }
    };

    initializeClientAndThreads();
  }, []);

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
                            break;  // Stop once the card_id is found
                        }
                    } catch (error) {
                        console.error('Error parsing message content:', error);
                    }
                }
            }

            const insights = item.insights || [];  // Extract insights (if any)

            // Reset necessary state values
            setThreadId(null);
            setSelectedChatHistory([]);
            setOldCardId([]);

            // Set the thread ID, messages, and insights
            setThreadId(item.thread_id);  // Set the selected thread id
            setSelectedChatHistory(threadMessages);  // Set the messages from selected thread
            setOldCardId(extractedCardId);  // Set the extracted card ID

            // If it's an insight type, set the insights
            if (item.type === "getInsights" && insights.length > 0) {
                setInsights(insights);
            }
        } else {
            console.error('No messages found in the selected thread.');
        }
    } catch (error) {
        console.error('Error fetching thread history:', error);
    }
};



  return (
    <Box
      style={{
        backgroundColor: "#FFF",
        borderRadius: "8px",
        padding: "16px",
        height: "85vh",
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
                }}
                onClick={() => handleHistoryItemClick(chat)}
              >
                <Text style={{ color: "#76797d" }}>
                  {/* Check and display the content of the first message */}
                  {chat.values?.messages?.[0]?.content || chat.thread_id}
                </Text>
                <Text style={{ color: "#76797d", cursor: "pointer" }}>⋮</Text>
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
                }}
                onClick={() => handleHistoryItemClick(chat)}
              >
                <Text style={{ color: "#76797d" }}>
                  {/* Check and display the content of the first message */}
                  {chat.values?.messages?.[0]?.content || chat.thread_id}
                </Text>
                <Text style={{ color: "#76797d", cursor: "pointer" }}>⋮</Text>
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
                }}
                onClick={() => handleHistoryItemClick(chat)}
              >
                <Text style={{ color: "#76797d" }}>
                  {/* Check and display the content of the first message */}
                  {chat.values?.messages?.[0]?.content || chat.thread_id}
                </Text>
                <Text style={{ color: "#76797d", cursor: "pointer" }}>⋮</Text>
              </Box>
            ))}
          </>
        )}
      </ScrollArea>

      {chatHistory.today.length === 0 &&
        chatHistory.last7Days.length === 0 &&
        chatHistory.last30Days.length === 0 && (
          <Text>No chat history available</Text>
        )}
    </Box>
  );
};

export default ChatHistory;
