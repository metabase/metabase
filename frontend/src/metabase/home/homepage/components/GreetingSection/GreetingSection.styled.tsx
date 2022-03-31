import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SectionRoot = styled.div`
  display: flex;
  align-items: center;
`;

export interface SectionMessageProps {
  showLogo?: boolean;
}

export const SectionMessage = styled.div<SectionMessageProps>`
  color: ${color("text-dark")};
  font-size: ${props => (props.showLogo ? "1.125rem" : "1.25rem")};
  font-weight: bold;
  line-height: 1.5rem;
  margin-left: ${props => props.showLogo && "0.5rem"};
`;
