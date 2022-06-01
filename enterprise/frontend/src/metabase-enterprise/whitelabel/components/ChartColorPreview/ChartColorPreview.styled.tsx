import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TableRoot = styled.div`
  display: flex;
  flex-direction: column;
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

export const TableBody = styled.div`
  flex: 1 1 auto;
  padding: 3rem 2rem;
  border: 1px solid ${color("border")};
  border-top: none;
  border-left: none;
  border-bottom-right-radius: 0.5rem;
`;
