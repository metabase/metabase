import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import TippyPopover from "metabase/components/Popover/TippyPopover";

export const ExpressionPopover = styled(TippyPopover)`
  border-color: ${alpha("accent2", 0.2)};
  border-radius: 0;
`;

export const ExpressionList = styled.ul`
  min-width: 150px;
  overflow-y: auto;
`;

export const ExpressionListItem = styled.li`
  padding-top: 5px;
  padding-bottom: 5px;

  ${({ isHighlighted }) =>
    isHighlighted &&
    `
      color: ${color("white")};
      background-color: ${color("brand")};
  `})}
`;
