import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";
import type { MantineTheme } from "metabase/ui";
import TableS from "metabase/visualizations/components/TableInteractive/TableInteractive.module.css";

export const TableRoot = styled.div`
  .${TableS.TableID} .${TableS.cellData} {
    ${({ theme }) => getIdColumnOverride(theme)}
  }
`;

function getIdColumnOverride(theme: MantineTheme) {
  const brand = theme.fn.themeColor("brand");
  const { backgroundColor } = theme.other.table.idColumn ?? {};

  return css`
    border: 1px solid ${backgroundColor ?? alpha(brand, 0.14)};
    background-color: ${backgroundColor ?? alpha(brand, 0.08)};
  `;
}
