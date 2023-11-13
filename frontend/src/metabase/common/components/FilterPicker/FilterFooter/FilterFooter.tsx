import { isValidElement } from "react";
import type { ReactNode } from "react";
import { t } from "ttag";
import { Box, Button } from "metabase/ui";
import { FilterFooterRoot } from "./FilterFooter.styled";

interface FilterFooterProps {
  isNew: boolean;
  canSubmit: boolean;
  children?: ReactNode;
  onSubmit: () => void;
}

export function FilterFooter({
  isNew,
  canSubmit,
  children,
  onSubmit,
}: FilterFooterProps) {
  return (
    <FilterFooterRoot p="sm" justify="space-between">
      {isValidElement(children) ? children : <Box />}
      <Button variant="filled" disabled={!canSubmit} onClick={onSubmit}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    </FilterFooterRoot>
  );
}
