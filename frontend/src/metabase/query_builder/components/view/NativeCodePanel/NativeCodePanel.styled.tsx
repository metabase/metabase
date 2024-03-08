import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
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
  overflow-wrap: break-word;
`;

interface CodeCopyButtonProps {
  isHighlighted?: boolean;
}

export const CodeCopyButton = styled(IconButtonWrapper)<CodeCopyButtonProps>`
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 1rem;
  height: 1rem;
  color: ${color("brand")};
  background-color: ${props =>
    color(props.isHighlighted ? "brand-light" : "bg-light")};
  visibility: hidden;
`;

export const CodeRoot = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  position: relative;

  &:hover {
    ${CodeCopyButton} {
      visibility: visible;
    }
  }
`;
