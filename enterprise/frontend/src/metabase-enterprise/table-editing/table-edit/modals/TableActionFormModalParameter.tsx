import type { PropsWithChildren } from "react";

import { Box, Group, Stack, Text } from "metabase/ui";

import {
  TableActionFormInputType,
  type TableActionFormParameter,
} from "../../api/types";

import S from "./TableActionFormModal.module.css";

type ActionFormModalParameterProps = PropsWithChildren<{
  parameter: TableActionFormParameter;
}>;

const INPUT_TYPE_TO_DISPLAY_TYPE_MAP: Record<TableActionFormInputType, string> =
  {
    [TableActionFormInputType.Text]: "text",
    [TableActionFormInputType.Textarea]: "description",
    [TableActionFormInputType.Date]: "date",
    [TableActionFormInputType.DateTime]: "date",
    [TableActionFormInputType.Dropdown]: "category",
    [TableActionFormInputType.Boolean]: "boolean",
    [TableActionFormInputType.Integer]: "integer",
    [TableActionFormInputType.Float]: "float",
  };

export function TableActionFormModalParameter({
  parameter,
  children,
}: ActionFormModalParameterProps) {
  return (
    <>
      <Group h="2.5rem" align="center">
        <Stack gap="0" className={S.modalBodyColumn} maw="100%">
          <Text truncate maw="100%">
            {parameter.display_name}
            {!parameter.optional && (
              <Text component="span" c="error">
                *
              </Text>
            )}
          </Text>
          <Text fz="sm" c="text-secondary" lh={1.1}>
            {INPUT_TYPE_TO_DISPLAY_TYPE_MAP[parameter.input_type] ?? "text"}
          </Text>
        </Stack>
      </Group>
      <Box>{children}</Box>
    </>
  );
}
