import { forwardRef } from "react";
import { t } from "ttag";

import { Flex, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./AttributeChip.module.css";

interface AttributeProps {
  name: string;
  value?: string;
}

function AttributeLabel({ name, value }: AttributeProps) {
  return (
    <>
      <Text component="span" fw="bold" c="text-primary">
        {name}
      </Text>
      <Text
        component="span"
        ml="xxs"
        c={value ? "text-primary" : "text-secondary"}
      >
        {value || t`No value`}
      </Text>
    </>
  );
}

interface AttributeChipProps extends AttributeProps {
  isOpen: boolean;
  onClick: () => void;
}

/** One user attribute a group's rules read, with a menu to pick its value. */
export const AttributeChip = forwardRef<HTMLButtonElement, AttributeChipProps>(
  function AttributeChip({ name, value, isOpen, onClick }, ref) {
    return (
      <UnstyledButton
        ref={ref}
        className={isOpen ? `${S.chip} ${S.open}` : S.chip}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={onClick}
      >
        <AttributeLabel name={name} value={value} />
        <Icon name="chevrondown" size={12} ml="sm" c="text-secondary" />
      </UnstyledButton>
    );
  },
);

/** A person's attribute, read-only: the chip without its chevron. */
export function AttributeTag({ name, value }: AttributeProps) {
  return (
    <Flex className={S.chip} component="span">
      <AttributeLabel name={name} value={value} />
    </Flex>
  );
}
