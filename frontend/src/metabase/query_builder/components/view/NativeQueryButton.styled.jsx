import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import {
  breakpointMinHeightExtraSmall,
  breakpointMinHeightMedium,
  breakpointMinHeightSmall,
  space,
} from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button";

export const SqlIconButton = styled(Button)`
  padding: ${space(1)};
  border: none;
  background-color: transparent;
  color: ${color("text-dark")};
  cursor: pointer;

  :hover {
    background-color: transparent;
    color: ${color("brand")};
  }
`;

SqlIconButton.defaultProps = {
  icon: "sql",
};

export const NativeCodeWrapper = styled.pre`
  box-sizing: border-box;
  display: inline-block;
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow: hidden;
  vertical-align: bottom;
  width: 100%;
`;

export const NativeCodeContainer = styled.code`
  box-sizing: border-box;
  display: inline-block;
  margin: 0;
  max-height: 20vh;
  max-width: 100%;
  overflow: auto;
  vertical-align: bottom;
  white-space: pre;
  width: 100%;
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
