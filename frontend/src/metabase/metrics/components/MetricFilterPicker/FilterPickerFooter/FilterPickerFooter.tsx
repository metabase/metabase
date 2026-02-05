import type { ReactNode } from "react";
import { isValidElement } from "react";

import { Box, Flex } from "metabase/ui";

import { FilterSubmitButton } from "../FilterSubmitButton";

import S from "./FilterPickerFooter.module.css";

interface FilterPickerFooterProps {
  isValid: boolean;
  children?: ReactNode;
}

export function FilterPickerFooter({
  isValid,
  children,
}: FilterPickerFooterProps) {
  return (
    <Flex className={S.FilterFooterRoot} p="md" justify="space-between">
      {isValidElement(children) ? children : <Box />}
      <FilterSubmitButton isDisabled={!isValid} />
    </Flex>
  );
}
