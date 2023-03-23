import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import UserAvatar from "metabase/components/UserAvatar";
import RunButton from "metabase/query_builder/components/RunButton";
import ViewSection from "metabase/query_builder/components/view/ViewSection";

export const HeaderRoot = styled(ViewSection)`
  display: block;
  padding-top: 0.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid ${color("border")};
`;

export const GreetingSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

export const GreetingMetabotLogo = styled(MetabotLogo)`
  height: 2.5rem;
`;

export const GreetingMessage = styled.div`
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: ${color("text-medium")};
  background-color: ${color("bg-light")};
  font-weight: bold;
`;

export const PromptSection = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1rem;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  box-shadow: 0 2px 2px ${color("shadow")};
`;

export const PromptUserAvatar = styled(UserAvatar)`
  flex-shrink: 0;
  background-color: ${color("accent2")};
`;

export const PromptRunButton = styled(RunButton)`
  flex-shrink: 0;
`;
