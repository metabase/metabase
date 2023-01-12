import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ActionTitle = styled.h4`
  font-size: 1rem;
  font-weight: 700;
  color: ${color("text-dark")};
`;

export const CodeBlock = styled.code`
  display: block;
  padding: 1rem;
  margin-top: 0.5rem;
  border-radius: 6px;

  font-family: "Fira Code", monospace;
  font-size: 0.7rem;
  color: ${color("text-white")};
  background-color: #12436e;
`;
