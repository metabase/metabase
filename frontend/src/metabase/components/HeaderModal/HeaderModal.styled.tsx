import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const HeaderModalRoot = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background-color: ${color("brand")};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  z-index: 4;
  min-height: 50px;
  transition: transform 400ms ease-in-out;
  overflow: hidden;
`;
