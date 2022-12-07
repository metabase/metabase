import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import {
  breakpointMinHeightExtraSmall,
  breakpointMinHeightMedium,
  breakpointMinHeightSmall,
} from "metabase/styled-components/theme";

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
  display: block;
  padding: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  overflow: hidden;
`;

export const CodeText = styled.code`
  display: block;
  width: 100%;
  overflow: auto;
  white-space: pre;
  word-break: break-all;
`;

export const CodeRoot = styled.div`
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
