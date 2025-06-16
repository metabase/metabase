import cx from "classnames";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getColumnIcon } from "metabase/common/utils/columns";
import EditableText from "metabase/core/components/EditableText";
import {
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Box, Flex, Group, Icon, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./FieldItem.module.css";

interface Props {
  active?: boolean;
  field: Field;
  href: string;
}

export const FieldItem = ({ active, field, href }: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));

  const handleNameChange = async (name: string) => {
    if (field.display_name === name) {
      return;
    }

    const { error } = await updateField({ id, display_name: name });

    if (!error) {
      sendToast({
        icon: "check",
        message: t`Display name for ${name} updated`,
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const newDescription = description.trim();

    if ((field.description ?? "") === newDescription) {
      return;
    }

    const { error } = await updateField({
      id,
      // API does not accept empty strings
      description: newDescription.length === 0 ? null : newDescription,
    });

    if (!error) {
      sendToast({
        icon: "check",
        message: t`Description for ${getFieldDisplayName(field)} updated`,
      });
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
    }
  };

  return (
    <Flex
      aria-label={field.display_name}
      bg={active ? "brand-lighter" : "bg-white"}
      c="text-medium"
      className={cx(S.field, {
        [S.active]: active,
      })}
      component={Link}
      direction="column"
      align="flex-start"
      gap={rem(12)}
      justify="space-between"
      mih={rem(40)}
      pos="relative"
      px="md"
      py={rem(12)}
      role="listitem"
      to={href}
      w="100%"
      wrap="nowrap"
      onClick={handleClick}
    >
      <Group flex="0 0 auto" gap="sm" maw="100%" wrap="nowrap">
        <Icon className={S.icon} flex="0 0 auto" name={icon} />

        <Box
          className={cx(S.input, S.name)}
          component={EditableText}
          fw="bold"
          initialValue={field.display_name}
          maxLength={254}
          miw={0}
          mb={rem(-4)}
          mt={rem(-3)}
          mx={rem(-2)}
          px={rem(1)}
          py={0}
          placeholder={t`Give this field a name`}
          tabIndex={undefined} // override the default 0 which breaks a11y
          onChange={handleNameChange}
          onClick={handleInputClick}
        />
      </Group>

      <Box
        className={S.input}
        component={EditableText}
        initialValue={field.description ?? ""}
        isOptional
        maw="100%"
        mb={rem(-4)}
        mt={rem(-3)}
        mx={rem(-2)}
        px={rem(1)}
        py={0}
        placeholder={t`No description yet`}
        tabIndex={undefined} // override the default 0 which breaks a11y
        onChange={handleDescriptionChange}
        onClick={handleInputClick}
      />
    </Flex>
  );
};
