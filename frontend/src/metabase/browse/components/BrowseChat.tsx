import { useState, useEffect } from "react";
import { Flex, Stack } from "metabase/ui";
import WebSocketHandler from "metabase/query_builder/components/WebSocketHandler";
import { BrowseContainer, BrowseMain } from "./BrowseContainer.styled";
import ChatHistory from "./ChatItems/ChatHistory";

export const BrowseChat = () => {
  const [selectedChatHistory, setSelectedChatHistory] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);

  return (
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
            <WebSocketHandler
              selectedMessages={selectedChatHistory}
              selectedThreadId={selectedThreadId}
            />
          </Stack>
          <Stack
            mb="lg"
            spacing="xs"
            style={{ width: "300px", marginTop: "1rem" }}
          >
            <ChatHistory
              setSelectedChatHistory={setSelectedChatHistory}
              setThreadId={setSelectedThreadId}
            />
          </Stack>
        </Flex>
      </BrowseMain>
    </BrowseContainer>
  );
};
