import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Button, Flex, Input } from "metabase/ui";

interface AddRowProps {
  value: string;
  isValid: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDone: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const AddRow = ({
  value,
  isValid,
  placeholder,
  ariaLabel,
  onKeyDown,
  onChange,
  onDone,
  onCancel,
  children,
}: AddRowProps) => (
  <Flex
    my="1rem"
    p="0.5rem"
    display="relative"
    align="center"
    wrap="wrap"
    bd="1px solid var(--mb-color-core-brand)"
    style={{ borderRadius: "0.5rem" }}
  >
    {children}
    <Input
      type="text"
      variant="unstyled"
      flex="1 1 auto"
      miw={0}
      fz="lg"
      styles={{ input: { background: "transparent" } }}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus
      onKeyDown={onKeyDown}
      onChange={onChange}
    />
    <Button
      variant="subtle"
      bg="transparent"
      flex="0 0 auto"
      onClick={onCancel}
      mr="sm"
    >
      {t`Cancel`}
    </Button>
    <Button
      variant={isValid ? "filled" : "outline"}
      flex="0 0 auto"
      disabled={!isValid}
      onClick={onDone}
    >
      {t`Add`}
    </Button>
  </Flex>
);
