import type { TableActionsExecuteFormVizOverride } from "metabase/visualizations/types/table-actions";
import type {
  EditableTableBuiltInActionDisplaySettings,
  FieldSettings,
  ParameterId,
  TableActionDisplaySettings,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

export const remapRowActionMappingsToActionOverride = ({
  name,
  parameterMappings,
}: TableRowActionDisplaySettings): TableActionsExecuteFormVizOverride => {
  const result: TableActionsExecuteFormVizOverride = {};

  if (name) {
    result.name = name;
  }

  if (parameterMappings) {
    result.fields = parameterMappings.reduce(
      (result, { parameterId: id, visibility }) => {
        result[id] = {
          id: id,
        };

        if (visibility === "hidden") {
          result[id].hidden = true;
        }

        if (visibility === "readonly") {
          result[id].readonly = true;
        }

        return result;
      },
      {} as Record<ParameterId, Partial<FieldSettings> & { id: string }>,
    );
  }

  return result;
};

export const isBuiltInEditableTableAction = (
  action:
    | TableActionDisplaySettings
    | EditableTableBuiltInActionDisplaySettings,
): action is EditableTableBuiltInActionDisplaySettings => {
  return ["data-grid.row/create", "data-grid.row/delete"].includes(
    (action as EditableTableBuiltInActionDisplaySettings).id,
  );
};
