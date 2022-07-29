import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import {
  space,
  breakpointMinHeightMedium,
} from "metabase/styled-components/theme";

export const TokenFieldContainer = styled.ul`
  display: flex;
  flex-wrap: wrap;
  padding: ${space(0)};
  gap: ${space(0)};
  font-weight: bold;
  cursor: pointer;

  max-height: 130px;

  background-color: ${color("white")};
  overflow-x: auto;
  overflow-y: auto;
  border-radius: ${space(1)};
  border: 1px solid ${color("border-dark")};
`;

export const TokenInputItem = styled.li`
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  margin-right: 0.5rem;
  padding: 0.5rem;
  height: 30px;
  ${breakpointMinHeightMedium} {
    height: 46px;
  }
`;
