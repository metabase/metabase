import { useCallback } from "react";

import type { SelectOption } from "metabase/ui";

import { EditingBodyCellCategorySelect } from "./EditingBodyCellCategorySelect";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellFKSelect = (props: EditingBodyPrimitiveProps) => {
  const getDropdownLabelText = useCallback(
    (item: SelectOption) =>
      item.label !== item.value ? `${item.label} [${item.value}]` : item.value,
    [],
  );

  const getSelectedLabelText = useCallback(
    (item: SelectOption) => item.label,
    [],
  );

  return (
    <EditingBodyCellCategorySelect
      {...props}
      getDropdownLabelText={getDropdownLabelText}
      getSelectedLabelText={getSelectedLabelText}
      // Temporary enable create new for FKs (see WRK-490)
      withCreateNew={true}
    />
  );
};
