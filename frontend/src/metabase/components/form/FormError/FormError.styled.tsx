import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import { alpha, color } from "metabase/lib/colors";

export const ErrorCard = styled(Card)`
  margin-top: 1.5rem;
  margin-bottom: 2rem;
  position: relative;
  background-color: ${alpha("error", 0.12)};
  border-color: ${color("error")};
  padding: 1rem 1.625rem;
  display: flex;
  align-items: center;
`;

export const WarningIcon = styled(Icon)`
  color: ${color("error")};
  width: 1.5rem;
  height: 1.5rem;
  margin-right: 1.5rem;
`;

interface ScrollAnchorProps {
  anchorMarginTop?: number;
}

export const ScrollAnchor = styled.div<ScrollAnchorProps>`
  position: absolute;
  top: ${props => -(props.anchorMarginTop || 0)}px;
`;
