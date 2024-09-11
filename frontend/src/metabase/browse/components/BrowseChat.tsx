import { useState, useEffect } from "react";
import { Flex, Stack } from "metabase/ui";
import ChatAssistant from "metabase/query_builder/components/ChatAssistant";
import { BrowseContainer, BrowseMain } from "./BrowseContainer.styled";
import ChatHistory from "./ChatItems/ChatHistory";

export const BrowseChat = () => {
  const [selectedChatHistory, setSelectedChatHistory] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [oldCardId, setOldCardId] = useState(null);
  const [insights, setInsights] = useState([]);

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
            <ChatAssistant
              selectedMessages={selectedChatHistory}
              selectedThreadId={selectedThreadId}
              chatType={"default"}
              oldCardId={oldCardId}
              insights={[]}
              setSelectedThreadId={setSelectedThreadId}
              initial_message={{
                message: "",
              }}
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
              type="dataAgent"
              setOldCardId={setOldCardId}
              setInsights={setInsights}
            />
          </Stack>
        </Flex>
      </BrowseMain>
    </BrowseContainer>
  );
};
