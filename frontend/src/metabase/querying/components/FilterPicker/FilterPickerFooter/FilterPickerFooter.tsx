import { isValidElement } from "react";
import type { ReactNode } from "react";
import { t } from "ttag";
import { Box, Button } from "metabase/ui";
import { FilterFooterRoot } from "./FilterPickerFooter.styled";

interface FilterPickerFooterProps {
  isNew: boolean;
  canSubmit: boolean;
  children?: ReactNode;
}

export function FilterPickerFooter({
  isNew,
  canSubmit,
  children,
}: FilterPickerFooterProps) {
  return (
    <FilterFooterRoot p="sm" justify="space-between">
      {isValidElement(children) ? children : <Box />}
      <Button type="submit" variant="filled" disabled={!canSubmit}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    </FilterFooterRoot>
  );
}
