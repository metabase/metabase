import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface CodeContainerProps {
  isHighlighted?: boolean;
}

export const CodeContainer = styled.pre<CodeContainerProps>`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  box-sizing: border-box;
  margin: 0;
  padding: 1rem;
  border: 1px solid ${props => color(props.isHighlighted ? "brand" : "border")};
  border-radius: 0.5rem;
  background-color: ${props =>
    color(props.isHighlighted ? "brand-light" : "bg-light")};
  overflow: auto;
`;

export const CodeText = styled.code`
  display: block;
  flex: 1 1 auto;
  box-sizing: border-box;
  font-size: 0.75rem;
  line-height: 1.125rem;
  white-space: pre;
  word-break: break-all;
`;

export const CodeRoot = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
`;
