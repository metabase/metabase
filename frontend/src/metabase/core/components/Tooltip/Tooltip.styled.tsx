import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const TooltipContainer = styled.div`
  text-align: center;
`;

export const TooltipTitle = styled.div`
  font-weight: bold;
`;

export const TooltipSubtitle = styled.div`
  font-weight: normal;
  color: ${color("text-light")};
`;
