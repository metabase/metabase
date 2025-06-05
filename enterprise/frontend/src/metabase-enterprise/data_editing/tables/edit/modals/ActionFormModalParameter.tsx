import type { PropsWithChildren } from "react";

import { Group, Icon, type IconName, Text } from "metabase/ui";

import { type ActionFormParameter, ActionFormParameterType } from "../../types";

import S from "./EditingBaseRowModal.module.css";

type ActionFormModalParameterProps = PropsWithChildren<{
  parameter: ActionFormParameter;
}>;

const DEFAULT_PARAMETER_ICON = "string";
const PARAMETER_ICON_MAP: Record<ActionFormParameterType, IconName> = {
  [ActionFormParameterType.Text]: "string",
  [ActionFormParameterType.Number]: "number",
  [ActionFormParameterType.Date]: "calendar",
  [ActionFormParameterType.DateTime]: "calendar",
  [ActionFormParameterType.Integer]: "number",
  [ActionFormParameterType.BigInteger]: "number",
};

export function ActionFormModalParameter({
  parameter,
  children,
}: ActionFormModalParameterProps) {
  return (
    <>
      <Group h="2.5rem" align="center">
        <Icon
          className={S.modalBodyColumn}
          name={PARAMETER_ICON_MAP[parameter.type] ?? DEFAULT_PARAMETER_ICON}
        />
        <Text className={S.modalBodyColumn}>
          {parameter.display_name}
          {parameter.optional && (
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
