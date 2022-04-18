import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { computeFontSize, PropsForFontSizeScaling } from "./utils";

export const ScalarRoot = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
`;

export const ScalarValueWrapper = styled.h1<PropsForFontSizeScaling>`
  cursor: pointer;
  &:hover {
    color: ${color("brand")};
  }

  font-size: ${computeFontSize};
`;
