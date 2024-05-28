import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { darken } from "metabase/lib/colors";

// Should be applied to :before or :after pseudo-elements to add a spacing between table sections such as header, body or footer
export const tableRowSpacingStyle = css`
  line-height: 0.5rem;
  content: " ";
  display: block;
`;

export const DataPointRoot = styled.div`
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
`;

export const DataPointHeader = styled.header`
  text-transform: uppercase;
  font-size: 12px;
  padding: 0 1.5rem 0.25rem 1.5rem;
`;

interface DataPointTableHeaderProps {
  hasBottomSpacing?: boolean;
}

export const DataPointTableHeader = styled.thead<DataPointTableHeaderProps>`
  &:after {
    ${props => (props.hasBottomSpacing ? tableRowSpacingStyle : null)}
  }
`;

export const tooltipSeparator = css`
  border-top: 1px solid ${darken("bg-dark", 0.55)};
`;

export const DataPointTableBody = styled.tbody`
  ${tooltipSeparator}

  &:before {
    ${tableRowSpacingStyle}
  }
`;

export const DataPointTableFooter = styled.tfoot`
  &:before {
    ${tableRowSpacingStyle}
  }
`;

export const DataPointTable = styled.table`
  border-collapse: collapse;
  margin: 0 0.75rem 0.75rem 0.75rem;
`;
