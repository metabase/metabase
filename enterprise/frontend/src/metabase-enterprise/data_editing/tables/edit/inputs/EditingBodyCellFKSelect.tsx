import { useCallback } from "react";

import type { SelectOption } from "metabase/ui";

import { EditingBodyCellCategorySelect } from "./EditingBodyCellCategorySelect";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellFKSelect = ({
  initialValue,
  datasetColumn,
  onSubmit,
  onCancel,
}: EditingBodyPrimitiveProps) => {
  const getDropdownLabelText = useCallback(
    (item: SelectOption) => `[${item.value}]: ${item.label}`,
    [],
  );

  return (
    <EditingBodyCellCategorySelect
      initialValue={initialValue}
      datasetColumn={datasetColumn}
      withCreateNew={false}
      getDropdownLabelText={getDropdownLabelText}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
};
