import styled from "styled-components";

import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  box-sizing: border-box;
  color: ${({ isNightMode }) => (isNightMode ? "white" : "inherit")};
  margin-top: ${space(4)};
`;
