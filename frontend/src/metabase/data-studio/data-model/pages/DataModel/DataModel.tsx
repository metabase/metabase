import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useHasTokenFeature } from "metabase/common/hooks";
import { hasLibraryCollection } from "metabase/data-studio/common/utils";
import { isCypressActive } from "metabase/env";
import {
  FieldValuesModal,
  NoDatabasesEmptyState,
  PreviewSection,
  type PreviewType,
} from "metabase/metadata/components";
import { getTableMetadataQuery } from "metabase/metadata/pages/shared/utils";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
} from "metabase/plugins";
import { useNavigate, useParams } from "metabase/router";
import { Box, Drawer, Flex, Stack, Transition, rem } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./DataModel.module.css";
import {
  DetailPanel,
  DetailPanelHeader,
  TableDetailsSkeleton,
} from "./DetailPanel";
import { FieldDetailsPanel } from "./FieldDetailsPanel";
import { RouterTablePicker } from "./TablePicker";
import type { TreePath } from "./TablePicker/types";
import { TableSection } from "./TableSection";
import { TableActionsMenu } from "./TableSection/TableActionsMenu";
import { TableAttributesEditBulk } from "./TableSection/TableAttributesEditBulk";
import {
  DRAWER_PANEL_WIDTH,
  NAV_COLUMN_CONFIG,
  REVEAL_WIDTH_DURATION_MS,
  REVEAL_WIDTH_TRANSITION,
} from "./constants";
import { SelectionProvider, useSelection } from "./contexts/SelectionContext";
import type { DrawerPanel, RouteParams } from "./types";
import { parseRouteParams } from "./utils";

export const DataModel = () => {
  return (
    <SelectionProvider>
      <DataModelContent />
    </SelectionProvider>
  );
};

function DataModelContent() {
  const params = useParams<RouteParams>();
  const navigate = useNavigate();
  const {
    hasSelectedItems,
    hasOnlyOneTableSelected,
    selectedTables,
    hasSelectedMoreThanOneTable,
    resetSelection,
  } = useSelection();
  const parsedParams = parseRouteParams(params);
  const {
    databaseId,
    fieldId,
    schemaName,
    tab: activeTab,
    tableId: queryTableId,
  } = parsedParams;
  const {
    data: databasesData,
    error: databasesError,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  );
  const databaseExists = databasesData?.data?.some(
    (database) => database.id === databaseId,
  );
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
    useDisclosure();
  const [
    isFieldValuesModalOpen,
    { close: closeFieldValuesModal, open: openFieldValuesModal },
  ] = useDisclosure();
  // Use the first selected table for fetching metadata when exactly one is selected
  const metadataTableId = Array.from(selectedTables)[0] ?? queryTableId;
  // But keep the URL tableId for navigation/path to avoid auto-expansion when selecting/deselecting
  const navigationTableId = hasSelectedItems ? queryTableId : queryTableId;

  const {
    // `currentData` so switching tables shows the loading state, not the previous table
    currentData: table,
    error: tableError,
    isFetching: isFetchingTable,
  } = useGetTableQueryMetadataQuery(getTableMetadataQuery(metadataTableId));
  const isLoadingTable = isFetchingTable && table == null;
  const fieldsByName = useMemo(() => {
    return _.indexBy(table?.fields ?? [], (field) => field.name);
  }, [table]);
  const field = table?.fields?.find((field) => field.id === fieldId);
  const parentName = field?.nfc_path?.[0] ?? "";
  const parentField = fieldsByName[parentName];

  const hasLibraryFeature = useHasTokenFeature("library");
  const { data: libraryCollection, isLoading: isLoadingLibrary } =
    PLUGIN_LIBRARY.useGetLibraryCollectionQuery(undefined, {
      skip: !hasLibraryFeature,
    });

  const [previewType, setPreviewType] = useState<PreviewType>("table");
  const [panelWidths, setPanelWidths] = useState(DRAWER_PANEL_WIDTH);
  const isLoading = isLoadingDatabases || isLoadingTable || isLoadingLibrary;
  const error = databasesError ?? tableError;

  const hasLibrary = hasLibraryCollection(libraryCollection);
  const canPublish = hasLibraryFeature;

  const [onUpdateCallback, setOnUpdateCallback] = useState<
    ((path?: TreePath) => void) | null
  >(null);

  useWindowEvent(
    "keydown",
    (event) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
          activeElement.isContentEditable);
      const isModalOpen = isFieldValuesModalOpen;

      if (event.key === "Escape" && !isInputFocused && !isModalOpen) {
        event.stopPropagation();
        closePreview();
      }
    },
    {
      // otherwise modals get closed earlier and isModalOpen evaluates to false in the handler
      capture: true,
    },
  );

  // Scroll only the drawer's panel row; `scrollIntoView` would also scroll the
  // page behind the drawer while it slides in.
  const scrollToPanel = useCallback((el: HTMLDivElement | null) => {
    const panelRow = el?.closest<HTMLElement>("[data-drawer-panels]");
    panelRow?.scrollTo({
      left: panelRow.scrollWidth,
      behavior: isCypressActive ? "instant" : "smooth",
    });
  }, []);

  const lastDrawerPanelsRef = useRef<ReactNode>(null);
  const lastFieldPanelRef = useRef<ReactNode>(null);

  if (databasesData?.data?.length === 0) {
    return <NoDatabasesEmptyState />;
  }

  // Widths survive the panel unmounting, e.g. when the drawer closes and reopens
  const handlePanelWidthChange = (panel: DrawerPanel) => (width: number) => {
    setPanelWidths((widths) => ({ ...widths, [panel]: width }));
  };

  const isEmptyStateShown =
    metadataTableId == null && fieldId == null && !hasSelectedItems;
  const showFieldPreview =
    !isEmptyStateShown && field && table && isPreviewOpen;

  const showBulkTableEdit = hasSelectedItems && !hasOnlyOneTableSelected;
  const showFieldDetails =
    fieldId != null && !showBulkTableEdit && !isEmptyStateShown;
  const showTableDetailsSection =
    metadataTableId != null &&
    !hasSelectedMoreThanOneTable &&
    !showBulkTableEdit;

  const isDrawerOpen =
    showBulkTableEdit || showTableDetailsSection || showFieldDetails;

  const closeDrawer = () => {
    closePreview();
    resetSelection();
    navigate(Urls.dataStudioData({ databaseId, schemaName }));
  };

  const handleTableUpdate = () => {
    if (table) {
      onUpdateCallback?.({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
      });
    }
  };

  const closeFieldDetails = () => {
    closePreview();
    navigate(
      Urls.dataStudioData({
        databaseId: table?.db_id,
        schemaName: table?.schema,
        tableId: table?.id,
      }),
    );
  };

  const fieldPanel = showFieldDetails ? (
    <FieldDetailsPanel
      ref={scrollToPanel}
      field={field}
      parentField={parentField}
      table={table}
      error={error}
      isLoading={isLoading}
      defaultWidth={panelWidths.field}
      onWidthChange={handlePanelWidthChange("field")}
      getFieldHref={(fieldId) =>
        Urls.dataStudioData({ ...parsedParams, fieldId })
      }
      onClose={closeFieldDetails}
      onFieldValuesClick={openFieldValuesModal}
      onPreviewClick={togglePreview}
    />
  ) : null;

  // Keep the last field panel rendered so it has content while it collapses
  if (fieldPanel) {
    lastFieldPanelRef.current = fieldPanel;
  }

  const drawerPanels = isDrawerOpen ? (
    <Flex
      bg="background_page-secondary"
      className={S.drawerPanels}
      h="100%"
      data-drawer-panels
    >
      {showBulkTableEdit && (
        <DetailPanel
          defaultWidth={panelWidths.table}
          onWidthChange={handlePanelWidthChange("table")}
        >
          <TableAttributesEditBulk
            canPublish={canPublish}
            hasLibrary={hasLibrary}
            onUpdate={() => onUpdateCallback?.()}
            onClose={closeDrawer}
          />
        </DetailPanel>
      )}

      {showTableDetailsSection && (
        <DetailPanel
          ref={scrollToPanel}
          defaultWidth={panelWidths.table}
          onWidthChange={handlePanelWidthChange("table")}
        >
          <DetailPanelHeader
            icon="table2"
            label={t`Table`}
            title={table?.display_name}
            isLoading={isLoading}
            actions={
              table && (
                <TableActionsMenu
                  table={table}
                  canPublish={canPublish}
                  hasLibrary={hasLibrary}
                  onUpdate={handleTableUpdate}
                />
              )
            }
            onClose={closeDrawer}
            data-testid="table-section-header"
          />
          {error ? (
            <LoadingAndErrorWrapper error={error} />
          ) : isLoading ? (
            <TableDetailsSkeleton />
          ) : (
            table && (
              <TableSection
                /**
                 * Make sure internal component state is reset when changing tables.
                 * This is to avoid state mix-up with optimistic updates.
                 */
                key={table.id}
                table={table}
                activeFieldId={fieldId}
                activeTab={activeTab}
                onUpdate={handleTableUpdate}
              />
            )
          )}
        </DetailPanel>
      )}

      <Transition
        mounted={showFieldDetails}
        transition={REVEAL_WIDTH_TRANSITION}
        duration={REVEAL_WIDTH_DURATION_MS}
        timingFunction="ease"
      >
        {(transitionStyles) => (
          <Box className={S.widthReveal} style={transitionStyles}>
            <Box className={S.widthRevealContent}>
              {fieldPanel ?? lastFieldPanelRef.current}
            </Box>
          </Box>
        )}
      </Transition>

      {showFieldPreview && databaseId != null && fieldId != null && (
        <Box
          flex="0 0 auto"
          h="100%"
          p="xl"
          w={panelWidths.preview}
          ref={scrollToPanel}
        >
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
  ) : null;

  // Keep the last panels rendered so the drawer has content while it slides out.
  if (drawerPanels) {
    lastDrawerPanelsRef.current = drawerPanels;
  }

  return (
    <Box className={S.container} data-testid="data-model" h="100%">
      <Flex
        bg="background_page-secondary"
        h="100%"
        style={{ overflow: "auto" }}
      >
        <PageContainer
          maw={NAV_COLUMN_CONFIG.max}
          miw={NAV_COLUMN_CONFIG.min}
          flex={NAV_COLUMN_CONFIG.flex}
          className={S.column}
          gap={0}
        >
          <PaneHeader
            breadcrumbs={
              <DataStudioBreadcrumbs>{t`Tables`}</DataStudioBreadcrumbs>
            }
          />
          <RouterTablePicker
            databaseId={databaseId}
            schemaName={schemaName}
            tableId={navigationTableId}
            params={params}
            setOnUpdateCallback={setOnUpdateCallback}
          />
        </PageContainer>

        {databaseId != null &&
          metadataTableId == null &&
          databaseExists === false && (
            <Stack
              className={S.column}
              h="100%"
              justify="center"
              miw={rem(400)}
              p="xxl"
            >
              <LoadingAndErrorWrapper error={t`Not found.`} />
            </Stack>
          )}
      </Flex>

      {/* Non-modal: the table list behind the drawer stays interactive. */}
      <Drawer
        opened={isDrawerOpen}
        onClose={closeDrawer}
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
        {drawerPanels ?? lastDrawerPanelsRef.current}
      </Drawer>

      {fieldId && (
        <FieldValuesModal
          fieldId={fieldId}
          isOpen={isFieldValuesModalOpen}
          onClose={closeFieldValuesModal}
        />
      )}
    </Box>
  );
}
