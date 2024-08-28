import React, { useEffect, useState } from "react";
import { Box, Text, ScrollArea, Title, Divider } from "metabase/ui";
import { useListCheckpointsQuery } from "metabase/api/checkpoints";
import dayjs from "dayjs";

const ChatHistory = ({ setSelectedChatHistory, setThreadId, type, setOldCardId }: any) => {
  const [chatHistory, setChatHistory] = useState({
    today: [],
    last7Days: [],
    last30Days: [],
  });

  const {
    data: checkpoints,
    error: checkpointsError,
    isLoading: isLoadingCheckpoints,
  } = useListCheckpointsQuery();

  useEffect(() => {
    if (checkpoints && checkpoints.length > 0) {
      const groupedHistory = checkpoints.reduce((acc: any, checkpoint: any) => {
        const { thread_id, step, agent_name, agent_description, card_id } = checkpoint;
        if (!acc[thread_id]) {
          acc[thread_id] = {
            ...checkpoint,
            card_id: card_id !== null && card_id !== 0 ? [card_id] : [],
            agent_description: agent_description && agent_description !== "" ? [agent_description] : [],
            agent_name: agent_name && agent_name !== "" ? [agent_name] : [],
          };
        } else {
          if (acc[thread_id].step < step) {
            acc[thread_id] = { 
              ...checkpoint,
              card_id: acc[thread_id].card_id,
              agent_description: acc[thread_id].agent_description,
              agent_name: acc[thread_id].agent_name,
            };
          }
    
          // Always update card_id if it's provided and non-empty
          if (card_id && card_id !== 0 && !acc[thread_id].card_id.includes(card_id)) {
            acc[thread_id].card_id.push(card_id);
          }
    
          // Always update agent_description if it's provided and non-empty
          if (agent_description && agent_description !== "" && !acc[thread_id].agent_description.includes(agent_description)) {
            acc[thread_id].agent_description.push(agent_description);
          }
    
          // Always update agent_name if it's provided and non-empty
          if (agent_name && agent_name !== "" && !acc[thread_id].agent_name.includes(agent_name)) {
            acc[thread_id].agent_name.push(agent_name);
          }
        }
    
        return acc;
      }, {});

      const rawChatGroups: any = Object.values(groupedHistory);
      console.log('type',type)
      const filteredGroups = rawChatGroups.filter((group: any) =>
        Array.isArray(group.agent_name) && group.agent_name.includes(type)
      );
      const chatGroups = filteredGroups.filter((group: any) =>
        Array.isArray(group.card_id) && group.card_id.length > 0
      );

      const today = dayjs().startOf("day");
      const last7Days = dayjs().subtract(7, "day").startOf("day");
      const last30Days = dayjs().subtract(30, "day").startOf("day");

      const categorizedHistory: any = {
        today: [],
        last7Days: [],
        last30Days: [],
      };

      chatGroups.forEach((chat: any) => {
        const parsedCheckpoint = JSON.parse(chat.checkpoint);
        const timestamp = dayjs(parsedCheckpoint.ts);

        if (timestamp.isSame(today, "day")) {
          categorizedHistory.today.push(chat);
        } else if (timestamp.isAfter(last7Days)) {
          categorizedHistory.last7Days.push(chat);
        } else if (timestamp.isAfter(last30Days)) {
          categorizedHistory.last30Days.push(chat);
        }
      });

      setChatHistory(categorizedHistory);
    }
  }, [checkpoints]);

  const handleHistoryItemClick = (item: any) => {
    setThreadId(null);
    setSelectedChatHistory([]);
    setOldCardId([])
    const parsedMetadata = JSON.parse(item.metadata);
    const messages = parsedMetadata.writes?.solve?.messages || [];
    setThreadId(item.thread_id);
    setSelectedChatHistory(messages);
    setOldCardId(item.card_id)
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

      <ScrollArea style={{ flex: 1 }}>
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
            {chatHistory.today.map((chat: any) => (
              <Box
                key={chat.checkpoint_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  cursor: "pointer",
                }}
                onClick={() => handleHistoryItemClick(chat)}
              >
                <Text style={{ color: "#76797d" }}>
                  {chat.agent_description[0] || chat.thread_id}
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
            {chatHistory.last7Days.map((chat: any) => (
              <Box
                key={chat.checkpoint_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  cursor: "pointer",
                }}
                onClick={() => handleHistoryItemClick(chat)}
              >
                <Text style={{ color: "#76797d" }}>
                {chat.agent_description[0] || chat.thread_id}
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
            {chatHistory.last30Days.map((chat: any) => (
              <Box
                key={chat.checkpoint_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  cursor: "pointer",
                }}
                onClick={() => handleHistoryItemClick(chat)}
              >
                <Text style={{ color: "#76797d" }}>
                {chat.agent_description[0] || chat.thread_id}
                </Text>
                <Text style={{ color: "#76797d", cursor: "pointer" }}>⋮</Text>
              </Box>
            ))}
          </>
        )}
      </ScrollArea>
    </Box>
  );
};

export default ChatHistory;
