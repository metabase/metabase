import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

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
