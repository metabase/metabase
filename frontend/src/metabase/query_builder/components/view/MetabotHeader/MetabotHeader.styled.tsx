import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import UserAvatar from "metabase/components/UserAvatar";
import ViewSection from "../ViewSection";

export const HeaderRoot = styled(ViewSection)`
  display: block;
  padding-top: 0.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid ${color("border")};
`;

export const GreetingSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const GreetingMetabotLogo = styled(MetabotLogo)`
  height: 2.5rem;
`;

export const GreetingMessage = styled.div`
  margin-left: 0.5rem;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: ${color("text-medium")};
  background-color: ${color("bg-light")};
  font-weight: bold;
`;

export const PromptSection = styled.div`
  display: flex;
  padding: 1rem;
  justify-content: space-between;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  box-shadow: 0 2px 2px ${color("shadow")};
`;

export const PromptUserAvatar = styled(UserAvatar)`
  background-color: ${color("accent2")};
`;

export const PromptUserAvatarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 1rem;
`;
