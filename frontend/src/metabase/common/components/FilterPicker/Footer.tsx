import type { ReactNode } from "react";
import { isValidElement } from "react";
import { t } from "ttag";
import { Box, Button } from "metabase/ui";
import { FilterFooterRoot } from "./FilterPicker.styled";

interface FooterProps {
  isNew: boolean;
  canSubmit: boolean;
  children?: ReactNode;
}

export function Footer({ isNew, canSubmit, children }: FooterProps) {
  return (
    <FilterFooterRoot>
      {isValidElement(children) ? children : <Box />}
      <Button type="submit" variant="filled" disabled={!canSubmit}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    </FilterFooterRoot>
  );
}
