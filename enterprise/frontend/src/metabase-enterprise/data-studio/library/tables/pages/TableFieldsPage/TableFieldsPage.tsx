import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer/PageContainer";
import { useLoadTableWithMetadata } from "metabase/data-studio/common/hooks/use-load-table-with-metadata";
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
import {
  Box,
  Button,
  Center,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

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
    <PageContainer data-testid="table-fields-page" gap="md" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <Flex
        className={S.body}
        flex={1}
        style={{ borderTop: "1px solid var(--mb-color-border)" }}
      >
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
            pl="3.5rem"
            pr="lg"
          />
        </Stack>
        {field != null && (
          <Stack
            className={S.column}
            flex="9 1 0"
            miw={320}
            maw={680}
            mih={0}
            px="lg"
            gap="0"
            pos="relative"
          >
            <Group
              justify="space-between"
              pt="lg"
              pb="md"
              data-testid="field-section-header"
              pos="sticky"
              top={0}
              className={S.header}
              bg="background-secondary"
            >
              <Text fw="bold">{t`Field Details`}</Text>
              <Button
                component={ForwardRefLink}
                to={Urls.dataStudioTableFields(table.id)}
                onClick={closePreview}
                leftSection={<Icon name="close" c="text-secondary" />}
                variant="subtle"
                size="compact-sm"
                p="sm"
              />
            </Group>
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
