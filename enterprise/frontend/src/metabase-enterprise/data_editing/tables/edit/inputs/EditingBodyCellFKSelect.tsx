import { useCallback } from "react";

import type { SelectOption } from "metabase/ui";

import { EditingBodyCellCategorySelect } from "./EditingBodyCellCategorySelect";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellFKSelect = (props: EditingBodyPrimitiveProps) => {
  const getDropdownLabelText = useCallback(
    (item: SelectOption) => `[${item.value}]: ${item.label}`,
    [],
  );

  return (
    <EditingBodyCellCategorySelect
      {...props}
      getDropdownLabelText={getDropdownLabelText}
      withCreateNew={false}
    />
  );
};
