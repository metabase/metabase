import type { ReactNode } from "react";
import { isValidElement } from "react";
import { t } from "ttag";
import { Box, Button } from "metabase/ui";
import { FilterFooterRoot } from "./FilterPicker.styled";

interface FooterProps {
  isNew: boolean;
  canSubmit: boolean;
  children?: ReactNode;
  onSubmit: () => void;
}

export function Footer({ isNew, canSubmit, children, onSubmit }: FooterProps) {
  return (
    <FilterFooterRoot>
      {isValidElement(children) ? children : <Box />}
      <Button variant="filled" disabled={!canSubmit} onClick={onSubmit}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    </FilterFooterRoot>
  );
}
