import type { TreeTableColumnDef } from "metabase/ui";
import {
  getLocationColumn,
  getNameColumn,
} from "metabase-enterprise/dependencies/components/DependencyTable";
import type { DependencyNode } from "metabase-types/api";

export function getColumns(): TreeTableColumnDef<DependencyNode>[] {
  return [getNameColumn(), getLocationColumn()];
}
