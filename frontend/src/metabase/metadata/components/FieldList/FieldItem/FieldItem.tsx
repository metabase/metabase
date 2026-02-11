import cx from "classnames";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Card, Flex, Group, Icon, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./FieldItem.module.css";

type FieldItemProps = {
  field: Field;
  href: string;
  active?: boolean;
  parent?: Field;
  readOnly?: boolean;
  onSelect?: () => void;
  onNameChange: (newName: string) => void;
  onDescriptionChange: (newDescription: string | null) => void;
};

export function FieldItem({
  active,
  field,
  href,
  parent,
  readOnly,
  onSelect,
  onNameChange,
  onDescriptionChange,
}: FieldItemProps) {
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));

  const handleNameChange = async (newValue: string) => {
    const newName = newValue.trim();
    if (field.display_name !== newName) {
      onNameChange(newName);
    }
  };

  const handleDescriptionChange = async (newValue: string) => {
    const trimmedValue = newValue.trim();
    const newDescription = trimmedValue.length === 0 ? null : trimmedValue;

    if (field.description !== newDescription) {
      onDescriptionChange(newDescription);
    }
  };

  const handleInputClick = (event: MouseEvent) => {
    // EditableText component breaks a11y with the programmatic
    // event.currentTarget.click() call. The click event bubbles
    // to this Link component. This is problematic e.g. when tabbing
    // out of the EditableText component, as the link gets clicked.
    if (!event.isTrusted) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const handleClick = (event: MouseEvent) => {
    // prevent navigation when focusing textareas with mouse
    if (
      event.target instanceof HTMLElement &&
      event.target.tagName === "TEXTAREA"
    ) {
      event.preventDefault();
    } else {
      onSelect?.();
    }
  };

  return (
    <Card
      aria-label={field.display_name}
      bg={active ? "background-brand" : "background-primary"}
      c="text-secondary"
      className={cx(S.card, {
        [S.active]: active,
      })}
      role="listitem"
      p={0}
      pb={1}
      withBorder
    >
      <Flex
        align="flex-start"
        className={S.link}
        component={Link}
        direction="column"
        draggable={false} // this + onClick handler is required, otherwise interaction is broken on macOS
        gap={rem(12)}
        justify="space-between"
        mih={rem(40)}
        pos="relative"
        px="md"
        py={rem(12)}
        to={href}
        w="100%"
        wrap="nowrap"
        onClick={handleClick} // this + draggable={false} is required, otherwise interaction is broken on macOS
      >
        <Group
          align="center"
          c="text-tertiary"
          flex="0 0 auto"
          gap={0}
          maw="100%"
          w="100%"
          wrap="nowrap"
        >
          <Icon className={S.icon} flex="0 0 auto" mr="sm" name={icon} />

          {parent && (
            <Box
              data-testid="name-prefix"
              flex="0 0 auto"
              lh="normal"
              maw="50%"
              mb={rem(-4)}
              mr="xs"
              mt={rem(-3)}
            >
              <Ellipsified lines={1} tooltip={parent.display_name}>
                {parent.display_name}
                {":"}
              </Ellipsified>
            </Box>
          )}

          <Box
            className={cx(S.input, S.name)}
            component={EditableText}
            fw="bold"
            initialValue={field.display_name}
            maxLength={254}
            mb={rem(-4)}
            ml={rem(-2)}
            mt={rem(-3)}
            placeholder={t`Give this field a name`}
            px={rem(1)}
            py={rem(2)}
            tabIndex={undefined} // override the default 0 which breaks a11y
            isDisabled={readOnly}
            onChange={handleNameChange}
            onClick={handleInputClick}
          />
        </Group>

        <Box
          className={cx(S.input, S.description)}
          component={EditableText}
          initialValue={field.description ?? ""}
          isMultiline
          isOptional
          maw="100%"
          mb={rem(-4)}
          mt={rem(-3)}
          mx={rem(-2)}
          px={rem(1)}
          py={0}
          placeholder={t`No description yet`}
          tabIndex={undefined} // override the default 0 which breaks a11y
          isDisabled={readOnly}
          onChange={handleDescriptionChange}
          onClick={handleInputClick}
        />
      </Flex>
    </Card>
  );
}
