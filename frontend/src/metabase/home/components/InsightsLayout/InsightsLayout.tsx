import {
  LayoutRoot,
  ContentContainer,
  ChatSection,
} from "./InsightsLayout.styled";
import { ChatGreeting } from "metabase/browse/components/ChatItems/Welcome";
import { HomeInitialOptions } from "metabase/browse/components/ChatItems/InitialOptions";
import ChatPrompt from "metabase/browse/components/ChatItems/Prompt";

export const InsightsLayout = () => {
  return (
    <LayoutRoot data-testid="insights-page">
      <ContentContainer>
        <ChatGreeting chatType={"insights"} />
        <HomeInitialOptions />
      </ContentContainer>
      <ChatSection>
        <ChatPrompt chatType={"insights"} />
      </ChatSection>
    </LayoutRoot>
  );
};
