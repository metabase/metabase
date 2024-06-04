import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";
import TableS from "metabase/visualizations/components/TableInteractive/TableInteractive.module.css";

export const TableRoot = styled.div`
  .${TableS.TableID} .${TableS.cellData} {
    border: 1px solid
      ${({ theme }) => alpha(theme.fn.themeColor("brand"), 0.14)};
    background-color: ${({ theme }) =>
      alpha(theme.fn.themeColor("brand"), 0.08)};
  }
`;
