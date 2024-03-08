import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";

export const TableRoot = styled.div`
  .Table-ID .cellData {
    border: 1px solid ${alpha("brand", 0.14)};
    background-color: ${alpha("brand", 0.08)};
  }
`;
