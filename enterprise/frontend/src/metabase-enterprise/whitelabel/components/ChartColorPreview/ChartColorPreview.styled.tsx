import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TableRoot = styled.div`
  flex: 1 1 auto;
`;

export const TableHeader = styled.div`
  display: block;
  padding: 1rem 1.5rem;
  border: 1px solid ${color("border")};
  border-left: none;
  border-top-right-radius: 0.5rem;
`;

export const TableTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
`;
