import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TableHeader = styled.div`
  border: 1px solid ${color("border")};
  border-bottom: none;
  border-radius: 0.5rem 0.5rem 0 0;
  background-color: ${color("bg-light")};
`;

export const TableRow = styled.div`
  display: flex;
`;

export const TableCell = styled.div`
  padding: 0.5rem 1.5rem;

  &:first-of-type {
    min-width: 13rem;
  }
`;

export const TableHeaderText = styled.span`
  color: ${color("text-medium")};
  font-size: 0.5rem;
  line-height: 0.625rem;
  text-transform: uppercase;
`;
