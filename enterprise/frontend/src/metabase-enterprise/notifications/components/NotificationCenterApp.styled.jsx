import styled from "styled-components";

import { color } from "metabase/lib/colors";

export const HeaderContainer = styled.div`
  padding: 0 1.5rem;
  border-bottom: 1px solid ${color("border")};
  display: flex;
  justify-content: center;
  font-size: 14px;
  height: 60px;
`;
