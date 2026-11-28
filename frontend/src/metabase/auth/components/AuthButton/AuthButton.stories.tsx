import { Center } from "metabase/ui";
import { StorySection, StoryShowcase } from "metabase/ui/stories/showcase";

import { LayoutCard } from "../AuthLayout/AuthLayout.styled";

import { AuthCardButton } from "./AuthButton";

export default {
  title: "App/Auth/AuthButton",
  component: AuthCardButton,
};

export const Default = {
  render: () => <AuthCardButton>Sign in with SSO</AuthCardButton>,
};

export const Overview = {
  render: () => (
    <StoryShowcase title="AuthButton">
      <StorySection
        title="Card button on the login screen"
        description="Showing AuthButton in it's native context on a LayoutCard with a primary background color"
      >
        <Center bg="background_page-secondary" p="3rem">
          <LayoutCard>
            <AuthCardButton>Sign in with SSO</AuthCardButton>
          </LayoutCard>
        </Center>
      </StorySection>
    </StoryShowcase>
  ),
  parameters: {
    controls: { include: ["theme"] },
  },
};
