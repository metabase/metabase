import type { PropsWithChildren } from "react";

import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { Group, Icon, type IconName, Text } from "metabase/ui";

import {
  TableActionFormInputType,
  type TableActionFormParameter,
} from "../api/types";

import S from "./TableActionFormModal.module.css";

type ActionFormModalParameterProps = PropsWithChildren<{
  parameter: TableActionFormParameter;
}>;

const DEFAULT_PARAMETER_ICON = "string";
const PARAMETER_ICON_MAP: Record<TableActionFormInputType, IconName> = {
  [TableActionFormInputType.Text]: "string",
  [TableActionFormInputType.Textarea]: "string",
  [TableActionFormInputType.Date]: "calendar",
  [TableActionFormInputType.DateTime]: "calendar",
  [TableActionFormInputType.Dropdown]: "string",
};

export function TableActionFormModalParameter({
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
