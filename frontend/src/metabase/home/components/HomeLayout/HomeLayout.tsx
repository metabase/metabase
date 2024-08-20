import { LayoutRoot, ContentContainer, ChatSection } from "./HomeLayout.styled";
import { ChatGreeting } from "metabase/browse/components/ChatItems/Welcome";
import { HomeInitialOptions } from "metabase/browse/components/ChatItems/InitialOptions";
import ChatPrompt from "metabase/browse/components/ChatItems/Prompt";

export const HomeLayout = () => {
  return (
    <LayoutRoot data-testid="home-page">
      <ContentContainer>
        <ChatGreeting />
        <HomeInitialOptions />
      </ContentContainer>
      <ChatSection>
        <ChatPrompt />
      </ChatSection>
    </LayoutRoot>
  );
};
