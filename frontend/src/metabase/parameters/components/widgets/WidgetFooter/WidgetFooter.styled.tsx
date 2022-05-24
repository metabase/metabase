import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const WidgetFooterRoot = styled.div`
  border-top: 1px solid ${color("border")};
  padding: 0.5rem;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
`;
