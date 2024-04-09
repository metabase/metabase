import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const Container = styled.div<{ isNightMode: boolean }>`
  box-sizing: border-box;
  color: ${({ isNightMode }) => (isNightMode ? "white" : "inherit")};
  margin-top: ${space(4)};
`;

export const QuestionCircleStyled = styled.span`
  display: inline-block;
  font-size: 3.25rem;
  width: 73px;
  height: 73px;
  border-radius: 99px;
  border: 3px solid currentcolor;
  text-align: center;
  line-height: normal;
`;
