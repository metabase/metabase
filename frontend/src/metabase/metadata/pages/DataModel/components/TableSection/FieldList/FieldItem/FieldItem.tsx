import cx from "classnames";
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
    if ((field.description ?? "") === description) {
      return;
    }

    const { error } = await updateField({ id, description });

    if (!error) {
      sendToast({
        icon: "check",
        message: t`Description for ${getFieldDisplayName(field)} updated`,
      });
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
      onClick={(event) => {
        // EditableText component breaks a11y with the programmatic
        // event.currentTarget.click() call. The click event bubbles
        // to this Link component. This is problematic e.g. when tabbing
        // out of the EditableText component, as the link gets clicked.

        if (!event.isTrusted) {
          event.preventDefault();
        }
      }}
    >
      <Group flex="0 0 auto" gap="sm" wrap="nowrap">
        <Icon className={S.icon} flex="0 0 auto" name={icon} />

        <Box
          className={S.input}
          component={EditableText}
          flex="1"
          fw="bold"
          initialValue={field.display_name}
          lh="normal"
          m={rem(-2)}
          maxLength={254}
          miw={0}
          p={rem(1)}
          placeholder={t`Give this field a name`}
          rows={1}
          onChange={handleNameChange}
        />
      </Group>

      <Box
        className={S.input}
        component={EditableText}
        h="auto"
        initialValue={field.description}
        isOptional
        lh="normal"
        m={rem(-2)}
        p={rem(1)}
        placeholder={t`No description yet`}
        rows={1}
        onChange={handleDescriptionChange}
      />
    </Flex>
  );
};
