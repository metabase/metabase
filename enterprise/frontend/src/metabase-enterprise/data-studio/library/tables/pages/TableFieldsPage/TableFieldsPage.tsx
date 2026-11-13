import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { useRef, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ResizablePanel } from "metabase/common/components/ResizablePanel";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { getColumnIcon } from "metabase/common/utils/columns";
import { DetailPanelHeader } from "metabase/data-studio/data-model/pages/DataModel/DetailPanel";
import {
  FieldActionsMenu,
  FieldDetails,
  FieldDetailsPanel,
} from "metabase/data-studio/data-model/pages/DataModel/FieldDetailsPanel";
import { HierarchyList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/HierarchyList";
import { TableFieldsTab } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableFieldsTab";
import { DRAWER_PANEL_WIDTH } from "metabase/data-studio/data-model/pages/DataModel/constants";
import { isPageEscape } from "metabase/data-studio/data-model/pages/DataModel/utils";
import {
  MetadataCardVariantProvider,
  PreviewSection,
  type PreviewType,
  SyncOptionsModal,
} from "metabase/metadata/components";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "metabase/router";
import {
  Box,
  Button,
  Center,
  Drawer,
  Flex,
  Icon,
  Stack,
  Tabs,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";

import {
  HierarchyPlacementToggle,
  getHierarchiesUrl,
  useHierarchyPlacement,
} from "../../components/HierarchyPlacement";
import { TableHeader } from "../../components/TableHeader";
import { TableListBody } from "../../components/TableListBody";

import S from "./TableFieldsPage.module.css";
import { TableSyncMenu } from "./TableSyncMenu";

type TableFieldsPageParams = {
  tableId: string;
  fieldId?: string;
};

const MIN_LIST_WIDTH = 320;
const MAX_LIST_WIDTH = 800;
const DEFAULT_LIST_WIDTH = 560;

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
  const [placement, setPlacement] = useHierarchyPlacement();
  const [searchParams] = useSearchParams();
  const isHierarchiesView = searchParams.get("view") === "hierarchies";
  // Kept here so the width survives picking another field
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  // Kept here so the drawer's width survives picking another field
  const [fieldPanelWidth, setFieldPanelWidth] = useState(
    DRAWER_PANEL_WIDTH.field,
  );
  // PROTOTYPE: in the field drawer variant, Esc closes the innermost panel, as
  // in Connected data. Assigned below, once the open panels are known.
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

  // PROTOTYPE: in the Fields placement, hierarchies are a sub-tab here
  if (placement !== "fields" && isHierarchiesView) {
    return <Navigate to={getHierarchiesUrl(placement, tableId)} replace />;
  }
  const hasSubTabs = placement === "fields";
  const subTabs = hasSubTabs && (
    <Box px="3.5rem">
      <Tabs
        value={isHierarchiesView ? "hierarchies" : "columns"}
        onChange={(value) =>
          navigate(
            value === "hierarchies"
              ? getHierarchiesUrl(placement, tableId)
              : Urls.dataStudioTableFields(tableId),
          )
        }
      >
        {/* Bleeds into the page's padding so the border spans the page */}
        <Tabs.List mx="-3.5rem" px="3.5rem">
          <Tabs.Tab value="columns">{t`Columns`}</Tabs.Tab>
          <Tabs.Tab value="hierarchies">{t`Hierarchies`}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
    </Box>
  );

  if (hasSubTabs && isHierarchiesView) {
    return (
      <PageContainer data-testid="table-fields-page" gap="lg" px={0} pb={0}>
        <TableHeader table={table} px="3.5rem" />
        {subTabs}
        <TableListBody hasPageBackground>
          <HierarchyList
            table={table}
            getFieldHref={(fieldId) =>
              Urls.dataStudioTableFields(tableId, fieldId)
            }
          />
        </TableListBody>
        <HierarchyPlacementToggle
          placement={placement}
          onChange={setPlacement}
        />
      </PageContainer>
    );
  }

  // PROTOTYPE: the "field drawer" variant: a full-width field list on the
  // page's background, with a field's details in a drawer as in Connected data
  if (placement === "drawer") {
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
            {/* Same flat, bordered field cards as the other variants */}
            <MetadataCardVariantProvider value="outlined">
              <TableFieldsTab
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
          <HierarchyPlacementToggle
            placement={placement}
            onChange={setPlacement}
          />
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
                  hierarchiesHref={getHierarchiesUrl(placement, tableId)}
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

  return (
    <PageContainer data-testid="table-fields-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <Stack gap={0} flex={1} mih={0}>
        {subTabs}
        {/* Flat, bordered metadata cards, as in Connected data's drawer */}
        <MetadataCardVariantProvider value="outlined">
          <Flex
            className={S.body}
            flex={1}
            bg="background_page-primary"
            style={
              // The sub-tabs' border already divides the page
              hasSubTabs
                ? undefined
                : { borderTop: "1px solid var(--mb-color-border-neutral)" }
            }
          >
            <ResizablePanel
              width={listWidth}
              minWidth={MIN_LIST_WIDTH}
              maxWidth={MAX_LIST_WIDTH}
              onWidthChange={setListWidth}
            >
              <Stack
                className={S.column}
                flex={1}
                miw={0}
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
                    !table.db?.is_attached_dwh && (
                      <Button
                        leftSection={<Icon name="gear_settings_filled" />}
                        onClick={openSyncModal}
                      >{t`Sync options`}</Button>
                    )
                  }
                />
              </Stack>
            </ResizablePanel>
            {field != null && (
              <Stack
                className={S.column}
                flex="9 1 0"
                miw={320}
                maw={680}
                mih={0}
                px="xl"
                pb="xl"
                gap="xl"
                pos="relative"
              >
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
                  hierarchiesHref={getHierarchiesUrl(placement, tableId)}
                  header={
                    <DetailPanelHeader
                      icon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
                      label={t`Field`}
                      title={field.display_name}
                      isLoading={false}
                      actions={
                        <FieldActionsMenu
                          fieldId={field.id}
                          onPreviewClick={togglePreview}
                        />
                      }
                      onClose={() => {
                        closePreview();
                        navigate(Urls.dataStudioTableFields(table.id));
                      }}
                      data-testid="field-section-header"
                    />
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
          </Flex>
        </MetadataCardVariantProvider>
      </Stack>
      <SyncOptionsModal
        isOpen={isSyncModalOpen}
        tableId={table.id}
        onClose={closeSyncModal}
      />
      <HierarchyPlacementToggle placement={placement} onChange={setPlacement} />
    </PageContainer>
  );
}
