import { t } from "ttag";
import { Flex, Group, Stack, Title } from "metabase/ui";
import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
} from "./BrowseContainer.styled";
import WebSocketHandler from "metabase/query_builder/components/WebSocketHandler";
import { HomeGreeting } from "metabase/home/components/HomeGreeting";
import MetabotWidget from "metabase/metabot/components/MetabotWidget";
import { ChatGreeting } from "./ChatItems/Welcome";
import ChatPrompt from "./ChatItems/Prompt";
import { HomeInitialOptions } from "./ChatItems/InitialOptions";

export const BrowseChat = () => {
  return (
    <BrowseContainer>
      <BrowseMain>
        <Stack mb="lg" spacing="xs" w="100%" mt="lg">
          <WebSocketHandler />
        </Stack>
      </BrowseMain>
    </BrowseContainer>
  );
};
