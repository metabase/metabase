import type { JSX, ReactNode } from "react";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Box, Flex, Switch } from "metabase/ui";

import S from "./ImageToggle.module.css";

export interface ImageToggleProps {
  label: string;
  value: boolean;
  children?: ReactNode;
  onChange: (value: boolean) => void;
}

export const ImageToggle = ({
  label,
  value,
  children,
  onChange,
}: ImageToggleProps): JSX.Element => {
  const toggleId = useUniqueId();

  return (
    <Flex className={S.border}>
      <Flex
        className={S.borderRight}
        w="7.5rem"
        justify="center"
        align="center"
      >
        {children}
      </Flex>
      <Flex
        flex="1 1 auto"
        justify="space-between"
        align="center"
        px="xl"
        py="xxl"
      >
        <Box component="label" htmlFor={toggleId} mr="xxl">
          {label}
        </Box>
        <Switch
          id={toggleId}
          aria-checked={value}
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      </Flex>
    </Flex>
  );
};
