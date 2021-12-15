import styled from "styled-components";

import { space } from "metabase/styled-components/theme";

export const NoWrap = styled.div`
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-weight: bold;
  padding-top: ${space(0)} 0;
`;
