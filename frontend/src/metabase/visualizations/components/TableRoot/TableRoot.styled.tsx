import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";
import TableS from "metabase/visualizations/components/TableInteractive/TableInteractive.module.css";

export const TableRoot = styled.div`
  .${TableS.TableID} .${TableS.cellData} {
    border: 1px solid ${alpha("brand", 0.14)};
    background-color: ${alpha("brand", 0.08)};
  }
`;
