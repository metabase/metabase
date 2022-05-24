import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TableRoot = styled.div`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const TableHeader = styled.div`
  background-color: ${color("bg-light")};
`;

export const TableHeaderRow = styled.div`
  display: flex;
`;

export const TableHeaderCell = styled.div`
  color: ${color("text-medium")};
  padding: 0.5rem 1.5rem;
  font-size: 0.5rem;
  line-height: 0.625rem;
  text-transform: uppercase;
`;
