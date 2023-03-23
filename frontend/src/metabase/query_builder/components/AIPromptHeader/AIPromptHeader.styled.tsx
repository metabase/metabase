import styled from "@emotion/styled";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import { color } from "metabase/lib/colors";

export const AIPromptHeaderRoot = styled.div`
  background-color: ${color("white")};
  padding: 1rem 3rem 2rem 3rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid ${color("border")};
`;

export const AIMetabotLogo = styled(MetabotLogo)`
  height: 2.5rem;
`;

export const MetabotReply = styled.div`
  margin-left: 0.5rem;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: ${color("text-medium")};
  font-weight: 700;
  background-color: ${color("bg-light")};
`;

export const AIMetabotSection = styled.div`
  padding: 1rem 0;
  display: flex;
  align-items: center;
`;

