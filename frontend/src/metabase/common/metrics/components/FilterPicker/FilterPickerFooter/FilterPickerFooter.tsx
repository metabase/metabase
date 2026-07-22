import type { ReactNode } from "react";
import { isValidElement } from "react";
import { t } from "ttag";

import { Box, Button, Flex } from "metabase/ui";

import { FilterSubmitButton } from "../FilterSubmitButton";

import S from "./FilterPickerFooter.module.css";

interface FilterPickerFooterProps {
  isNew?: boolean;
  isValid: boolean;
  onClear?: () => void;
  children?: ReactNode;
}

export function FilterPickerFooter({
  isNew,
  isValid,
  onClear,
  children,
}: FilterPickerFooterProps) {
  return (
    <Flex className={S.FilterFooterRoot} p="md" justify="space-between">
      {onClear ? (
        <Button variant="subtle" c="text-secondary" onClick={onClear}>
          {t`Clear`}
        </Button>
      ) : isValidElement(children) ? (
        children
      ) : (
        <Box />
      )}
      <FilterSubmitButton isNew={isNew} isDisabled={!isValid} />
    </Flex>
  );
}
