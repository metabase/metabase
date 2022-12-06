import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import {
  breakpointMinHeightExtraSmall,
  breakpointMinHeightMedium,
  breakpointMinHeightSmall,
} from "metabase/styled-components/theme";

export const NativeCodeButton = styled(IconButtonWrapper)`
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 1rem;
  height: 1rem;
  color: ${color("brand")};
  cursor: pointer;
`;

export const NativeCodeContainer = styled.pre`
  display: block;
  padding: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
  overflow: hidden;
`;

export const NativeCodeText = styled.code`
  display: block;
  width: 100%;
  max-height: 20vh;
  overflow: auto;
  white-space: pre;
  word-break: break-all;

  ${breakpointMinHeightExtraSmall} {
    max-height: 25vh;
  }

  ${breakpointMinHeightSmall} {
    max-height: 45vh;
  }

  ${breakpointMinHeightMedium} {
    max-height: 60vh;
  }
`;

export const NativeCodeRoot = styled.div`
  position: relative;

  ${NativeCodeButton} {
    display: none;
  }

  &:hover {
    ${NativeCodeButton} {
      display: block;
    }
  }
`;
