import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const CodeCopyButton = styled(IconButtonWrapper)`
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 1rem;
  height: 1rem;
  color: ${color("brand")};
  cursor: pointer;
`;

export const CodeContainer = styled.pre`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  box-sizing: border-box;
  margin: 0;
  padding: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  overflow: auto;
`;

export const CodeText = styled.code`
  display: block;
  flex: 1 1 auto;
  box-sizing: border-box;
  white-space: pre;
  word-break: break-all;
`;

export const CodeRoot = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  position: relative;

  ${CodeCopyButton} {
    display: none;
  }

  &:hover {
    ${CodeCopyButton} {
      display: block;
    }
  }
`;
