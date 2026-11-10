import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { getColumnIcon } from "metabase/common/utils/columns";
import { DetailPanelHeader } from "metabase/data-studio/data-model/pages/DataModel/DetailPanel";
import {
  FieldActionsMenu,
  FieldDetails,
} from "metabase/data-studio/data-model/pages/DataModel/FieldDetailsPanel";
import { SemanticReviewButton } from "metabase/data-studio/data-model/pages/DataModel/SemanticReview";
import { TableFieldsTab } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableFieldsTab";
import {
  FieldEmptyState,
  PreviewSection,
  type PreviewType,
  SyncOptionsModal,
} from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { useNavigate, useParams } from "metabase/router";
import { Box, Button, Center, Flex, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";

import { TableHeader } from "../../components/TableHeader";

import S from "./TableFieldsPage.module.css";

type TableFieldsPageParams = {
  tableId: string;
  fieldId?: string;
};

export function TableFieldsPage() {
  const params = useParams<TableFieldsPageParams>();
  const navigate = useNavigate();
  const tableId = Urls.extractEntityId(params.tableId);
  const fieldId = Urls.extractEntityId(params.fieldId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);
  const field = table?.fields?.find((field) => field.id === fieldId);
  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
    useDisclosure();
  const [isSyncModalOpen, { close: closeSyncModal, open: openSyncModal }] =
    useDisclosure();

  if (isLoading || error != null || table == null || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="table-fields-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <Flex
        className={S.body}
        flex={1}
        bg="background_page-primary"
        style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Stack
          className={S.column}
          flex="8 1 0"
          miw={320}
          maw={640}
          mih={0}
          pt="xl"
          pb="xl"
          pl="3.5rem"
          pr="xl"
        >
          <TableFieldsTab
            /**
             * Make sure internal component state is reset when changing tables.
             * This is to avoid state mix-up with optimistic updates.
             */
            key={tableId}
            table={table}
            activeFieldId={fieldId}
            getFieldHref={(fieldId) =>
              Urls.dataStudioTableFields(tableId, fieldId)
            }
            actions={
              <>
                {table.can_write && <SemanticReviewButton table={table} />}
                {!table.db?.is_attached_dwh && (
                  <Button
                    leftSection={<Icon name="gear_settings_filled" />}
                    onClick={openSyncModal}
                  >{t`Sync options`}</Button>
                )}
              </>
            }
          />
        </Stack>
        {field != null && (
          <Stack
            className={S.column}
            flex="9 1 0"
            miw={320}
            maw={680}
            mih={0}
            px="xl"
            gap="xl"
            pos="relative"
          >
            <Box
              pt="xl"
              pos="sticky"
              top={0}
              className={S.header}
              bg="background_page-primary"
            >
              <DetailPanelHeader
                icon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
                label={t`Field`}
                title={field.display_name}
                isLoading={false}
                actions={
                  <FieldActionsMenu
                    fieldId={getRawTableFieldId(field)}
                    onPreviewClick={togglePreview}
                  />
                }
                onClose={() => {
                  closePreview();
                  navigate(Urls.dataStudioTableFields(table.id));
                }}
                data-testid="field-section-header"
              />
            </Box>
            <FieldDetails
              /**
               * Make sure internal component state is reset when changing fields.
               * This is to avoid state mix-up with optimistic updates.
               */
              key={fieldId}
              field={field}
              table={table}
              getFieldHref={(fieldId) =>
                Urls.dataStudioTableFields(tableId, fieldId)
              }
            />
          </Stack>
        )}
        {isPreviewOpen && field != null && (
          <Box flex="10 1 0" miw={504} maw={734} p="xl">
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
    </PageContainer>
  );
}
