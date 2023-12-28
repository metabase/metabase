import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Stack } from "metabase/ui";

export const CopyButtonContainer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  cursor: pointer;
  z-index: 2;

  &:hover {
    color: ${color("brand")};
  }
`;

export const NoCodeDiffContainer = styled(Stack)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: ${color("text-light")};
`;
