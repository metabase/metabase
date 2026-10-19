import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { FieldSection, FieldValuesModal } from "metabase/metadata/components";
import { getTableMetadataQuery } from "metabase/metadata/pages/shared/utils";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId, FieldId } from "metabase-types/api";

import { trackMetadataChange } from "../../analytics";

import S from "./ReviewModal.module.css";

type FieldDetailsPaneProps = {
  tableId: ConcreteTableId;
  fieldId: FieldId;
  /** Width in pixels; the review modal lets the person resize it. */
  width: number;
  onClose: () => void;
};

/** The same field details as the data studio's field panel, for the field of a suggestion. */
export function FieldDetailsPane({
  tableId,
  fieldId,
  width,
  onClose,
}: FieldDetailsPaneProps) {
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(tableId));
  const [
    isFieldValuesModalOpen,
    { open: openFieldValuesModal, close: closeFieldValuesModal },
  ] = useDisclosure();

  const fieldsByName = useMemo(
    () => _.indexBy(table?.fields ?? [], (field) => field.name),
    [table],
  );
  const field = table?.fields?.find((field) => field.id === fieldId);
  const parent = fieldsByName[field?.nfc_path?.[0] ?? ""];

  return (
    <Stack
      gap="sm"
      className={S.fieldPane}
      style={{ flex: `0 0 ${width}px` }}
      data-testid="field-details-pane"
    >
      <Group justify="space-between" wrap="nowrap">
        <Text fw="bold">{t`Field details`}</Text>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={t`Close field details`}
          onClick={onClose}
        >
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <ScrollArea flex={1} type="hover" offsetScrollbars>
        {error != null && (
          <Text c="feedback-negative">{getErrorMessage(error)}</Text>
        )}
        {isLoading && <Loader size="sm" />}
        {table != null && field == null && !isLoading && (
          <Text c="text-secondary">{t`This field no longer exists.`}</Text>
        )}
        {table != null && field != null && (
          <FieldSection
            key={getRawTableFieldId(field)}
            field={field}
            parent={parent}
            table={table}
            getFieldHref={(fieldId) =>
              Urls.dataStudioData({
                databaseId: table.db_id,
                schemaName: table.schema,
                tableId: table.id,
                fieldId,
              })
            }
            onTrackMetadataChange={trackMetadataChange}
            onFieldValuesClick={openFieldValuesModal}
          />
        )}
      </ScrollArea>
      <FieldValuesModal
        fieldId={fieldId}
        isOpen={isFieldValuesModalOpen}
        onClose={closeFieldValuesModal}
      />
    </Stack>
  );
}
