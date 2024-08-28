import { Flex, Stack } from "metabase/ui";
import { BrowseContainer, BrowseMain } from "./BrowseContainer.styled";
import WebSocketHandler from "metabase/query_builder/components/WebSocketHandler";
import { useState } from "react";
import ChatHistory from "./ChatItems/ChatHistory";

export const BrowseInsights = () => {
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
              appType={"insights"}
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
              type="getInsights"
            />
          </Stack>
        </Flex>
      </BrowseMain>
    </BrowseContainer>
  );
};
