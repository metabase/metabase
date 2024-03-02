import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

export const NudgeCard = styled.div`
  background-color: ${color("bg-light")};
  border-radius: 0.375rem;
  padding: 1.25rem 1.5rem;
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
`;

export const Description = styled.div`
  margin-top: 1rem;
`;

export const Subtitle = styled.div`
  margin-top: 0.5rem;
  font-weight: 700;
`;

export const ProLink = styled(ExternalLink)`
  margin-top: 1rem;
  font-weight: 700;
  padding: 0.75rem 1rem;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  color: ${color("brand")};
  width: fit-content;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
