import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";

export const FieldListGroupingTrigger = styled.div`
  display: flex;
  visibility: hidden;
  border-left: 2px solid ${alpha("filter", 0.1)};
  color: ${alpha("text-white", 0.5)};
`;
