import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { useRef, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { DetailPanelHeader } from "metabase/data-studio/data-model/pages/DataModel/DetailPanel";
import { FieldDetailsPanel } from "metabase/data-studio/data-model/pages/DataModel/FieldDetailsPanel";
import { TableFieldsTab } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableFieldsTab";
import { DRAWER_PANEL_WIDTH } from "metabase/data-studio/data-model/pages/DataModel/constants";
import { isPageEscape } from "metabase/data-studio/data-model/pages/DataModel/utils";
import {
  MetadataCardVariantProvider,
  PreviewSection,
  type PreviewType,
} from "metabase/metadata/components";
import { useNavigate, useParams } from "metabase/router";
import { Box, Center, Drawer, Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";
import { TableListBody } from "../../components/TableListBody";

import S from "./TableFieldsPage.module.css";
import { TableSyncMenu } from "./TableSyncMenu";

type TableFieldsPageParams = {
  tableId: string;
  fieldId?: string;
};

/**
 * PROTOTYPE: a full-width field list on the page's background, with a field's
 * details in a drawer as in Connected data
 */
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
  // Kept here so the drawer's width survives picking another field
  const [fieldPanelWidth, setFieldPanelWidth] = useState(
    DRAWER_PANEL_WIDTH.field,
  );
  // Esc closes the innermost panel, as in Connected data. Assigned below, once
  // the open panels are known.
  const drawerContainerRef = useRef<HTMLDivElement>(null);
  const closeDrawerPanelRef = useRef<() => void>(() => undefined);
  useWindowEvent("keydown", (event) => {
    if (
      event.key === "Escape" &&
      isPageEscape(event.target, drawerContainerRef.current)
    ) {
      closeDrawerPanelRef.current();
    }
  });

  if (isLoading || error != null || table == null || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const closeField = () => {
    closePreview();
    navigate(Urls.dataStudioTableFields(tableId));
  };
  // Esc closes the preview first, then the drawer
  closeDrawerPanelRef.current = () => {
    if (isPreviewOpen) {
      closePreview();
    } else if (field != null) {
      closeField();
    }
  };

  return (
    <Box ref={drawerContainerRef} className={S.drawerContainer} h="100%">
      <PageContainer data-testid="table-fields-page" gap="lg" px={0} pb={0}>
        <TableHeader table={table} px="3.5rem" />
        <TableListBody hasPageBackground>
          <MetadataCardVariantProvider value="outlined">
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
              searchVariant="page"
              actions={
                !table.db?.is_attached_dwh && <TableSyncMenu table={table} />
              }
            />
          </MetadataCardVariantProvider>
        </TableListBody>
      </PageContainer>
      {/* Non-modal, like Connected data's: the list stays interactive */}
      <Drawer
        opened={field != null}
        onClose={closeField}
        position="right"
        size="auto"
        padding={0}
        withinPortal={false}
        withOverlay={false}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        lockScroll={false}
        trapFocus={false}
        returnFocus={false}
        shadow="lg_outline"
        classNames={{ body: S.drawerBody }}
      >
        <MetadataCardVariantProvider value="outlined">
          {field != null && (
            <Flex h="100%" bg="background_page-secondary">
              <FieldDetailsPanel
                field={field}
                table={table}
                error={undefined}
                isLoading={false}
                defaultWidth={fieldPanelWidth}
                onWidthChange={setFieldPanelWidth}
                getFieldHref={(fieldId) =>
                  Urls.dataStudioTableFields(tableId, fieldId)
                }
                hierarchiesHref={Urls.dataStudioTableHierarchies(tableId)}
                onClose={closeField}
                onPreviewClick={togglePreview}
              />
              {isPreviewOpen && (
                <Stack
                  flex="0 0 auto"
                  h="100%"
                  p="xl"
                  gap="xl"
                  w={DRAWER_PANEL_WIDTH.preview}
                >
                  <DetailPanelHeader
                    title={t`Field preview`}
                    onClose={closePreview}
                  />
                  <Box flex={1} mih={0}>
                    <PreviewSection
                      className={S.preview}
                      field={field}
                      table={table}
                      previewType={previewType}
                      withHeader={false}
                      onPreviewTypeChange={setPreviewType}
                      onClose={closePreview}
                    />
                  </Box>
                </Stack>
              )}
            </Flex>
          )}
        </MetadataCardVariantProvider>
      </Drawer>
    </Box>
  );
}
