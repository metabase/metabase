import { memo, useState } from "react";
import { t } from "ttag";

import {
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  FieldOrderPicker,
  NameDescriptionInput,
  SortableFieldList,
} from "metabase/metadata/components";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import type { RouteParams } from "../../types";
import { getUrl, parseRouteParams } from "../../utils";

import { FieldList } from "./FieldList";
import { SyncOptionsModal } from "./SyncOptionsModal";
import S from "./TableSection.module.css";

interface Props {
  params: RouteParams;
  table: Table;
}

const TableSectionBase = ({ params, table }: Props) => {
  const { fieldId, ...parsedParams } = parseRouteParams(params);
  const [updateTable] = useUpdateTableMutation();
  const [updateTableFieldsOrder] = useUpdateTableFieldsOrderMutation();
  const [sendToast] = useToast();
  const [isSorting, setIsSorting] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  return (
    <Stack gap={0} p="xl" pt={0}>
      <Box
        bg="bg-white"
        className={S.header}
        pb="lg"
        pos="sticky"
        pt="xl"
        top={0}
      >
        <NameDescriptionInput
          description={table.description ?? ""}
          descriptionPlaceholder={t`Give this table a description`}
          name={table.display_name}
          nameIcon="table2"
          nameMaxLength={254}
          namePlaceholder={t`Give this table a name`}
          onDescriptionChange={async (description) => {
            await updateTable({ id: table.id, description });

            sendToast({
              icon: "check",
              message: t`Table description updated`,
            });
          }}
          onNameChange={async (name) => {
            await updateTable({ id: table.id, display_name: name });

            sendToast({
              icon: "check",
              message: t`Table name updated`,
            });
          }}
        />
      </Box>

      <Stack gap="lg">
        <Stack gap={12}>
          <Group align="center" gap="md" justify="space-between" wrap="nowrap">
            <Group align="center" gap="md" h="100%" wrap="nowrap">
              {!isSorting && <Text flex="0 0 auto" fw="bold">{t`Fields`}</Text>}

              {isSorting && (
                <FieldOrderPicker
                  value={table.field_order}
                  onChange={async (fieldOrder) => {
                    await updateTable({
                      id: table.id,
                      field_order: fieldOrder,
                    });

                    sendToast({
                      icon: "check",
                      message: t`Field order updated`,
                    });
                  }}
                />
              )}
            </Group>

            <Group gap="md" justify="flex-end">
              {!isSorting && (
                <Button
                  h={32}
                  leftSection={<Icon name="sort_arrows" />}
                  px="sm"
                  py="xs"
                  size="xs"
                  onClick={() => setIsSorting(true)}
                >{t`Sorting`}</Button>
              )}

              {!isSorting && (
                <Button
                  h={32}
                  leftSection={<Icon name="gear_settings_filled" />}
                  px="sm"
                  py="xs"
                  size="xs"
                  onClick={() => setIsSyncModalOpen(true)}
                >{t`Sync options`}</Button>
              )}

              {isSorting && (
                <Button
                  h={32}
                  px="md"
                  py="xs"
                  size="xs"
                  onClick={() => setIsSorting(false)}
                >{t`Done`}</Button>
              )}
            </Group>
          </Group>

          {isSorting && (
            <SortableFieldList
              activeFieldId={fieldId}
              table={table}
              onChange={async (fieldOrder) => {
                await updateTableFieldsOrder({
                  id: table.id,
                  // in this context field id will never be a string because it's a raw table field, so it's ok to cast
                  field_order: fieldOrder as FieldId[],
                });

                sendToast({
                  icon: "check",
                  message: t`Field order updated`,
                });
              }}
            />
          )}

          {!isSorting && (
            <FieldList
              activeFieldId={fieldId}
              getFieldHref={(fieldId) => getUrl({ ...parsedParams, fieldId })}
              table={table}
            />
          )}
        </Stack>
      </Stack>

      <SyncOptionsModal
        isOpen={isSyncModalOpen}
        tableId={table.id}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </Stack>
  );
};

export const TableSection = memo(TableSectionBase);
