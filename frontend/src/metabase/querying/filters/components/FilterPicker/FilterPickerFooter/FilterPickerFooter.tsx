import cx from "classnames";
import type { ReactNode } from "react";
import { isValidElement } from "react";

import { Box, Flex } from "metabase/ui";

import { FilterSubmitButton } from "../FilterSubmitButton";

import S from "./FilterPickerFooter.module.css";

interface FilterPickerFooterProps {
  isNew: boolean;
  isValid: boolean;
  withAddButton: boolean;
  withSeparator?: boolean;
  children?: ReactNode;
  onAddButtonClick: () => void;
}

export function FilterPickerFooter({
  isNew,
  isValid,
  withAddButton = false,
  withSeparator = true,
  children,
  onAddButtonClick,
}: FilterPickerFooterProps) {
  return (
    <Flex
      className={cx(S.FilterFooterRoot, {
        [S.separator]: withSeparator,
      })}
      p="md"
      justify="space-between"
    >
      {isValidElement(children) ? children : <Box />}
      <FilterSubmitButton
        isNew={isNew}
        isDisabled={!isValid}
        withAddButton={withAddButton}
        onAddButtonClick={onAddButtonClick}
      />
    </Flex>
  );
}
