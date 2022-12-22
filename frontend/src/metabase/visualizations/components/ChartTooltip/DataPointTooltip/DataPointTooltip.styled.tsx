import styled from "@emotion/styled";
import { darken } from "metabase/lib/colors";

export const DataPointRoot = styled.div`
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
`;

export const DataPointDimension = styled.div`
  text-transform: uppercase;
  font-size: 11px;
  padding: 0 1.5rem 0.25rem 1.5rem;
`;

export const DataPointTableHeader = styled.thead`
  padding-bottom: 0.5rem;

  &:after {
    line-height: 0.5rem;
    content: " ";
    display: block;
  }
`;

export const DataPointTableBody = styled.tbody`
  border-top: 1px solid ${darken("text-medium", 0.55)};
  margin-top: 0.5rem;

  &:before {
    line-height: 0.5rem;
    content: " ";
    display: block;
  }
`;

export const DataPointTableFooter = styled.tfoot`
  &:before {
    line-height: 0.5rem;
    content: " ";
    display: block;
  }
`;

export const DataPointTable = styled.table`
  border-collapse: collapse;
  margin: 0 0.75rem 0.75rem 0.75rem;
`;
