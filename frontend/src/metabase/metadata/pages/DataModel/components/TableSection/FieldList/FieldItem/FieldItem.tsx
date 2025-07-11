import cx from "classnames";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import EditableText from "metabase/common/components/EditableText";
import { useToast } from "metabase/common/hooks";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Card, Flex, Group, Icon, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./FieldItem.module.css";

interface Props {
  active?: boolean;
  field: Field;
  href: string;
  parent?: Field;
}

export const FieldItem = ({ active, field, href, parent }: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));

  const handleNameChange = async (name: string) => {
    if (field.display_name === name) {
      return;
    }

    const { error } = await updateField({ id, display_name: name });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update name of ${field.display_name}`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Name of ${field.display_name} updated`,
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

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update description of ${field.display_name}`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Description of ${field.display_name} updated`,
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
    <Card
      aria-label={field.display_name}
      bg={active ? "brand-light" : "bg-white"}
      c="text-medium"
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
          flex="0 0 auto"
          gap={0}
          maw="100%"
          w="100%"
          wrap="nowrap"
        >
          <Icon className={S.icon} flex="0 0 auto" mr="sm" name={icon} />

          {parent && (
            <Text
              c="text-light"
              data-testid="name-prefix"
              flex="0 0 auto"
              lh="normal"
              lineClamp={1}
              maw="50%"
              mb={rem(-4)}
              mr="xs"
              mt={rem(-3)}
            >
              {parent.display_name}
              {":"}
            </Text>
          )}

          <Box
            className={cx(S.input, S.name)}
            // TODO: fix EditableText or use something else
            // https://linear.app/metabase/issue/SEM-429/data-model-inline-field-namedescription-inputs
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
            onChange={handleNameChange}
            onClick={handleInputClick}
          />
        </Group>

        <Box
          className={S.input}
          // TODO: fix EditableText or use something else
          // https://linear.app/metabase/issue/SEM-429/data-model-inline-field-namedescription-inputs
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
          onChange={handleDescriptionChange}
          onClick={handleInputClick}
        />
      </Flex>
    </Card>
  );
};
