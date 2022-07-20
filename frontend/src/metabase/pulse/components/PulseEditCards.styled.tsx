import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface CardNoticeProps {
  isWarning: boolean;
}

export const CardNotice = styled.div<CardNoticeProps>`
  margin: 0.5rem 0 1rem 2rem;
  padding-left: 2rem;
  color: ${props => (props.isWarning ? color("accent4") : "")};
  border-left: 3px solid
    ${props => (props.isWarning ? color("warning") : color("brand"))};
`;
