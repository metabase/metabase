import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const Root = styled.div`
  padding: 1rem 1.5rem 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
`;

interface ContentSectionProps {
  extraPadding?: boolean;
}

export const ContentSection = styled.div<ContentSectionProps>`
  display: flex;
  flex-direction: column;
  ${props => (props.extraPadding ? "padding: 2rem 0;" : "padding: 1rem 0;")}
  border-bottom: 1px solid ${color("border")};

  &:last-of-type {
    border-bottom: none;
  }

  &:first-of-type {
    padding-top: 0;
  }
`;
