import { t } from "ttag";

import type {
  BasicTableViewColumn,
  TableActionsExecuteFormVizOverride,
} from "metabase/visualizations/types/table-actions";
import type {
  EditableTableBuiltInActionDisplaySettings,
  FieldSettings,
  ParameterId,
  PartialRowActionFieldSettings,
  RowActionFieldSettings,
  TableActionDisplaySettings,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

export const remapRowActionMappingsToActionOverride = ({
  id,
  name,
  parameterMappings,
}: TableRowActionDisplaySettings): TableActionsExecuteFormVizOverride => {
  const result: TableActionsExecuteFormVizOverride = {};

  if (id) {
    result.id = id;
  }

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
  return action.actionType === "data-grid/built-in";
};

export const isValidMapping = (
  mapping: PartialRowActionFieldSettings,
  tableColumns: BasicTableViewColumn[],
): mapping is RowActionFieldSettings => {
  if (mapping.sourceType === "ask-user") {
    return true;
  }

  if (mapping.sourceType === "row-data") {
    return (
      "sourceValueTarget" in mapping &&
      !!mapping.sourceValueTarget &&
      !!tableColumns.find(({ name }) => name === mapping.sourceValueTarget)
    );
  }

  if (mapping.sourceType === "constant") {
    return "value" in mapping && mapping.value != null;
  }

  return false;
};

export const getFieldFlagsCaption = ({
  isRequired,
  isHidden,
}: {
  isRequired: boolean;
  isHidden: boolean;
}) => {
  return [isRequired ? t`required` : "", isHidden ? t`hidden` : ""]
    .filter(Boolean)
    .join(", ");
};

export const cleanEmptyVisibility = (
  parameters: RowActionFieldSettings[],
): RowActionFieldSettings[] => {
  return parameters.map((parameter) => {
    if (parameter.sourceType === "ask-user" && "visibility" in parameter) {
      const copy = { ...parameter };

      delete copy.visibility;

      return copy;
    }

    return parameter;
  });
};
