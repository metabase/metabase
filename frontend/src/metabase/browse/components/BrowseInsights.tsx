import { Stack } from "metabase/ui";
import { BrowseContainer, BrowseMain } from "./BrowseContainer.styled";
import WebSocketHandler from "metabase/query_builder/components/WebSocketHandler";

export const BrowseInsights = () => {
  return (
    <BrowseContainer>
      <BrowseMain>
        <Stack mb="lg" spacing="xs" w="100%" mt="lg">
          <WebSocketHandler selectedMessages={null} selectedThreadId={null} />
        </Stack>
      </BrowseMain>
    </BrowseContainer>
  );
};
