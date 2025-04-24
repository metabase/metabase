import type { ReactNode } from "react";
import { isValidElement } from "react";

import { Box, Flex } from "metabase/ui";

import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterChangeOpts } from "../types";

import S from "./FilterPickerFooter.module.css";

interface FilterPickerFooterProps {
  isNew: boolean;
  isValid: boolean;
  withAddButton?: boolean;
  children?: ReactNode;
  onSubmit: (opts: FilterChangeOpts) => void;
}

export function FilterPickerFooter({
  isNew,
  isValid,
  withAddButton = false,
  children,
  onSubmit,
}: FilterPickerFooterProps) {
  return (
    <Flex className={S.FilterFooterRoot} p="md" justify="space-between">
      {isValidElement(children) ? children : <Box />}
      <FilterSubmitButton
        isNew={isNew}
        isValid={isValid}
        withAddButton={withAddButton}
        onSubmit={onSubmit}
      />
    </Flex>
  );
}
