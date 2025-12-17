import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import {
  FieldEmptyState,
  FieldSection,
  FieldValuesModal,
  PreviewSection,
  type PreviewType,
  SyncOptionsModal,
  TableSection,
} from "metabase/metadata/components";
import { Box, Center, Flex, Stack } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";

import { trackMetadataChange } from "../../analytics";
import { TableHeader } from "../../components/TableHeader";

import S from "./TableFieldsPage.module.css";

type TableFieldsPageParams = {
  tableId: string;
  fieldId?: string;
};

type TableFieldsPageProps = {
  params: TableFieldsPageParams;
};

export function TableFieldsPage({ params }: TableFieldsPageProps) {
  const tableId = Urls.extractEntityId(params.tableId);
  const fieldId = Urls.extractEntityId(params.fieldId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);
  const field = table?.fields?.find((field) => field.id === fieldId);
  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
    useDisclosure();
  const [isSyncModalOpen, { close: closeSyncModal, open: openSyncModal }] =
    useDisclosure();
  const [
    isFieldValuesModalOpen,
    { close: closeFieldValuesModal, open: openFieldValuesModal },
  ] = useDisclosure();

  if (isLoading || error != null || table == null || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer
      header={<TableHeader table={table} />}
      data-testid="table-fields-page"
      gap="md"
    >
      <Flex className={S.body} flex={1}>
        <Stack className={S.column} flex="8 1 0" miw={320} maw={640} mih={0}>
          <TableSection
            /**
             * Make sure internal component state is reset when changing tables.
             * This is to avoid state mix-up with optimistic updates.
             */
            key={tableId}
            table={table}
            fieldId={fieldId}
            getFieldHref={(fieldId) =>
              Urls.dataStudioTableFields(tableId, fieldId)
            }
            onSyncOptionsClick={openSyncModal}
            px={0}
            pr="lg"
          />
        </Stack>
        {field != null && (
          <Stack className={S.column} flex="9 1 0" miw={320} maw={680} mih={0}>
            <FieldSection
              /**
               * Make sure internal component state is reset when changing tables.
               * This is to avoid state mix-up with optimistic updates.
               */
              key={fieldId}
              field={field}
              table={table}
              getFieldHref={(fieldId) =>
                Urls.dataStudioTableFields(tableId, fieldId)
              }
              onPreviewClick={togglePreview}
              onFieldValuesClick={openFieldValuesModal}
              onTrackMetadataChange={trackMetadataChange}
            />
          </Stack>
        )}
        {isPreviewOpen && field != null && (
          <Box flex="10 1 0" miw={504} maw={734} p="lg">
            <PreviewSection
              className={S.preview}
              field={field}
              table={table}
              previewType={previewType}
              onPreviewTypeChange={setPreviewType}
              onClose={closePreview}
            />
          </Box>
        )}
        {field == null && (
          <Flex align="center" flex="1" justify="center" miw={240}>
            <FieldEmptyState hasTable />
          </Flex>
        )}
      </Flex>
      <SyncOptionsModal
        isOpen={isSyncModalOpen}
        tableId={table.id}
        onClose={closeSyncModal}
      />

      {fieldId != null && (
        <FieldValuesModal
          fieldId={fieldId}
          isOpen={isFieldValuesModalOpen}
          onClose={closeFieldValuesModal}
        />
      )}
    </PageContainer>
  );
}
