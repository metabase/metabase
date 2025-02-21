import type { ReactNode } from "react";
import { isValidElement } from "react";
import { t } from "ttag";

import { Box, Button, Flex } from "metabase/ui";

import S from "./FilterPickerFooter.module.css";

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
    <Flex className={S.FilterFooterRoot} p="md" justify="space-between">
      {isValidElement(children) ? children : <Box />}
      <Button type="submit" variant="filled" disabled={!canSubmit}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    </Flex>
  );
}
