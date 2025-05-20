import type { EditableTableActionsVizOverride } from "metabase-enterprise/data_editing/tables/types";
import type {
  EditableTableRowActionDisplaySettings,
  FieldSettings,
  ParameterId,
} from "metabase-types/api";

export const remapRowActionMappingsToActionOverride = ({
  name,
  parameterMappings,
}: EditableTableRowActionDisplaySettings): EditableTableActionsVizOverride => {
  const result: EditableTableActionsVizOverride = {};

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
