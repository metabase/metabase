import type { ReactNode } from "react";
import { isValidElement, useContext } from "react";

import { Box, Flex } from "metabase/ui";

import { FilterFooterLabelContext } from "../FilterPreviewContext";
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
  const footerLabel = useContext(FilterFooterLabelContext);

  if (!isValidElement(children) && !withSubmitButton) {
    return null;
  }

  return (
    <Flex
      className={S.FilterFooterRoot}
      p="lg"
      justify="space-between"
      data-filter-picker-footer
    >
      {isValidElement(children) ? children : (footerLabel ?? <Box />)}

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
