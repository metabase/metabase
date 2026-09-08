import {
  getLocationColumn,
  getNameColumn,
} from "metabase-enterprise/dependencies/components/DependencyTable";
import type { DependencyNode } from "metabase-types/api";
import type { TreeTableColumnDef } from "metabase/ui";

export function getColumns(): TreeTableColumnDef<DependencyNode>[] {
  return [getNameColumn(), getLocationColumn()];
}
