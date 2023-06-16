import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import ExternalLink from "metabase/core/components/ExternalLink";

export const NudgeCard = styled.div`
  background-color: ${color("bg-light")};
  border-radius: 6px;
  padding: 20px 24px;
  margin-top: 32px;
  display: flex;
  flex-direction: column;
`;

export const Description = styled.div`
  margin-top: 16px;
`;

export const Subtitle = styled.div`
  margin-top: 8px;
  font-weight: 700;
`;

export const ProLink = styled(ExternalLink)`
  margin-top: 16px;
  font-weight: 700;
  padding: 12px 16px;
  border: 1px solid ${color("brand")};
  border-radius: 8px;
  color: ${color("brand")};
  width: fit-content;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
