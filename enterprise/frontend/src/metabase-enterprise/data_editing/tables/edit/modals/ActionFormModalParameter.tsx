import type { PropsWithChildren } from "react";

import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { Group, Icon, type IconName, Text } from "metabase/ui";

import { ActionFormInputType, type ActionFormParameter } from "../../types";

import S from "./EditingBaseRowModal.module.css";

type ActionFormModalParameterProps = PropsWithChildren<{
  parameter: ActionFormParameter;
}>;

const DEFAULT_PARAMETER_ICON = "string";
const PARAMETER_ICON_MAP: Record<ActionFormInputType, IconName> = {
  [ActionFormInputType.Text]: "string",
  [ActionFormInputType.Textarea]: "string",
  [ActionFormInputType.Date]: "calendar",
  [ActionFormInputType.DateTime]: "calendar",
  [ActionFormInputType.Dropdown]: "string",
};

export function ActionFormModalParameter({
  parameter,
  children,
}: ActionFormModalParameterProps) {
  const iconName = parameter.semantic_type
    ? FIELD_SEMANTIC_TYPES_MAP[parameter.semantic_type].icon
    : PARAMETER_ICON_MAP[parameter.input_type];

  return (
    <>
      <Group h="2.5rem" align="center">
        <Icon
          className={S.modalBodyColumn}
          name={iconName ?? DEFAULT_PARAMETER_ICON}
        />
        <Text className={S.modalBodyColumn}>
          {parameter.display_name}
          {!parameter.optional && (
            <Text component="span" c="error">
              *
            </Text>
          )}
        </Text>
      </Group>
      {children}
    </>
  );
}
