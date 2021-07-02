import { Box } from "grid-styled";
import styled from "styled-components";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

export const ContentBox = styled(Box)`
  background-color: white;
  height: 100%;
  margin-left: ${SIDEBAR_WIDTH};
  overflow-y: auto;
  padding-bottom: 64px;
`;
