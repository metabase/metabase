import { useCallback } from "react";

import type { SelectOption } from "metabase/ui";

import { EditingBodyCellBasicInput } from "./EditingBodyCellBasicInput";
import { EditingBodyCellCategorySelect } from "./EditingBodyCellCategorySelect";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellFKSelect = (props: EditingBodyPrimitiveProps) => {
  const { field } = props;

  const shouldDisplayValuesList = field?.has_field_values === "list";

  const getDropdownLabelText = useCallback(
    (item: SelectOption) => `${item.label} [${item.value}]`,
    [],
  );

  if (shouldDisplayValuesList) {
    return (
      <EditingBodyCellCategorySelect
        {...props}
        getDropdownLabelText={getDropdownLabelText}
        withCreateNew={false}
      />
    );
  }

  return <EditingBodyCellBasicInput {...props} />;
};
