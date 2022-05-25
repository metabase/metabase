import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TableHeader = styled.div`
  display: block;
  padding: 1rem 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem 0.5rem 0 0;
`;

export const TableTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
`;

export const TableBody = styled.div`
  border: 1px solid ${color("border")};
  border-top: none;
  border-radius: 0 0 0.5rem 0.5rem;
`;

export const TableBodyRow = styled.div`
  display: flex;
  align-items: center;

  &:not(:first-of-type) {
    border-top: 1px solid ${color("border")};
  }
`;

export const TableBodyCell = styled.div`
  width: 12rem;
  padding: 1rem 1.5rem;

  &:not(:first-of-type) {
    background-color: ${color("bg-light")};
  }
`;
