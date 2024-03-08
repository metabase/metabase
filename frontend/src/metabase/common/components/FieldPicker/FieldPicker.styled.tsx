import styled from "@emotion/styled";

import {
  QueryColumnInfoIcon as _QueryColumnInfoIcon,
  HoverParent,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { color, alpha, darken } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ItemTitle = styled.div`
  min-width: 10ch;
`;

export const ItemIcon = styled(Icon)`
  margin: 0 0.5em;
  margin-left: 0.75em;
  color: ${color("text-dark")};
`;

export const QueryColumnInfoIcon = styled(_QueryColumnInfoIcon)`
  color: ${alpha(darken(color("brand"), 0.6), 0.8)};
  margin-left: auto;
`;

export const ItemList = styled.ul`
  padding: 0.5em;
`;

export const ToggleItem = styled.li`
  border-bottom: 1px solid ${color("border")};
  padding-bottom: 0.5em;
  margin-bottom: 0.5em;

  ${ItemTitle} {
    margin-left: 1em;
  }
`;

export const Label = styled(HoverParent)`
  display: flex;
  align-items: center;
  padding: 0 0.5em;
  padding-right: 0;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: ${color("bg-medium")};
  }

  ${ToggleItem} & {
    padding: 0.5em;
  }
`;
