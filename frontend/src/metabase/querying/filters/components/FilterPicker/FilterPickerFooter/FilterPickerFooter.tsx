import type { ReactNode } from "react";
import { isValidElement } from "react";

import { Box, Flex } from "metabase/ui";

import { FilterSubmitButton } from "../FilterSubmitButton";

import S from "./FilterPickerFooter.module.css";

interface FilterPickerFooterProps {
  isNew: boolean;
  isValid: boolean;
  withAddButton: boolean;
  withSubmitButton: boolean;
  children?: ReactNode;
  onAddButtonClick: () => void;
}

export function FilterPickerFooter({
  isNew,
  isValid,
  withAddButton,
  withSubmitButton,
  children,
  onAddButtonClick,
}: FilterPickerFooterProps) {
  if (!isValidElement(children) && !withSubmitButton) {
    return null;
  }

  return (
    <Flex className={S.FilterFooterRoot} p="md" justify="space-between">
      {isValidElement(children) ? children : <Box />}

      {withSubmitButton && (
        <FilterSubmitButton
          isNew={isNew}
          isDisabled={!isValid}
          withAddButton={withAddButton}
          onAddButtonClick={onAddButtonClick}
        />
      )}
    </Flex>
  );
}
