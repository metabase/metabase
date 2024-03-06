import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";
import { ColumnItem } from "../ColumnItem";

export const TableColumnSelectorRoot = styled.div`
  ${ColumnItem.Root}[data-enabled="false"] {
    color: ${color("text-light")};

    ${ColumnItem.Icon} {
      color: ${color("text-light")};
    }
  }
`;
