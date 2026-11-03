import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { t } from "ttag";

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
  MetadataCardVariantProvider,
  NoDatabasesEmptyState,
  PreviewSection,
  type PreviewType,
} from "metabase/metadata/components";
import { useDataLayers } from "metabase/metadata/data-layers";
import { getTableMetadataQuery } from "metabase/metadata/pages/shared/utils";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
} from "metabase/plugins";
import { useNavigate, useParams } from "metabase/router";
import { Box, Drawer, Flex, Stack, Transition, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  DatabaseId,
  FieldId,
  SchemaName,
  TableId,
} from "metabase-types/api";

import S from "./DataModel.module.css";
import { DatabaseDetailsPanel } from "./DatabaseDetailsPanel";
import {
  DetailPanel,
  DetailPanelHeader,
  TableDetailsSkeleton,
} from "./DetailPanel";
import { FieldDetailsPanel } from "./FieldDetailsPanel";
import { PropertyDetailsPanel } from "./PropertyDetailsPanel";
import { SchemaDetailsPanel } from "./SchemaDetailsPanel";
import { RouterTablePicker } from "./TablePicker";
import type { ChangeOptions, TreePath } from "./TablePicker/types";
import { TableSection } from "./TableSection";
import { TableActionsMenu } from "./TableSection/TableActionsMenu";
import { TableAttributesEditBulk } from "./TableSection/TableAttributesEditBulk";
import {
  DRAWER_PANEL_WIDTH,
  NAV_COLUMN_CONFIG,
  REVEAL_WIDTH_DURATION_MS,
  REVEAL_WIDTH_TRANSITION,
} from "./constants";
import {
  PropertySelectionProvider,
  usePropertySelection,
} from "./contexts/PropertySelectionContext";
import { SelectionProvider, useSelection } from "./contexts/SelectionContext";
import type { DrawerPanel, RouteParams } from "./types";
import { parseRouteParams } from "./utils";

export const DataModel = () => {
  return (
    <SelectionProvider>
      <PropertySelectionProvider>
        <DataModelContent />
      </PropertySelectionProvider>
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
  const { selectedPropertyName, setSelectedPropertyName } =
    usePropertySelection();
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
  const field = table?.fields?.find((field) => field.id === fieldId);

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
  // The tree path the person last clicked. The tree also selects a lone
  // database or schema on its own, and that must not open a drawer.
  const [pickedPath, setPickedPath] = useState<TreePath | null>(null);
  const {
    getDataLayers,
    setDataLayers,
    getSchemaDataLayer,
    setSchemaDataLayerId,
    getSchemaDisplayName,
    setSchemaDisplayName,
  } = useDataLayers();

  const handlePathChange = useCallback(
    (path: TreePath, options?: ChangeOptions) => {
      if (!options?.isAutomatic) {
        setPickedPath(path);
      }
    },
    [],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // Assigned each render below, once the open panels are known; they're
  // computed after the early return, which hooks can't follow
  const closeActivePanelRef = useRef<() => void>(() => undefined);

  useWindowEvent("keydown", (event) => {
    if (
      event.key === "Escape" &&
      isPageEscape(event.target, containerRef.current)
    ) {
      closeActivePanelRef.current();
    }
  });

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

  const openContainer = getOpenContainer({
    pickedPath,
    databaseId,
    schemaName,
    databaseExists,
    fieldId,
    hasSelectedItems,
    tableId: metadataTableId,
  });

  const showPropertyDetails =
    showTableDetailsSection &&
    activeTab === "properties" &&
    table != null &&
    selectedPropertyName != null;

  const isDrawerOpen =
    openContainer != null ||
    showBulkTableEdit ||
    showTableDetailsSection ||
    showFieldDetails;

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

  const closeContainerDetails = () => setPickedPath(null);

  // Esc closes the innermost open panel: preview, then field, then the drawer
  closeActivePanelRef.current = () => {
    if (showPropertyDetails) {
      setSelectedPropertyName(null);
    } else if (showFieldPreview) {
      closePreview();
    } else if (showFieldDetails) {
      closeFieldDetails();
    } else if (openContainer != null) {
      closeContainerDetails();
    } else if (isDrawerOpen) {
      closeDrawer();
    }
  };

  const renderContainerPanel = (container: OpenContainer) => {
    if (container.type === "database") {
      return (
        <DatabaseDetailsPanel
          ref={scrollToPanel}
          databaseId={container.databaseId}
          defaultWidth={panelWidths.database}
          onWidthChange={handlePanelWidthChange("database")}
          dataLayers={getDataLayers(container.databaseId)}
          onDataLayersChange={(layers) =>
            setDataLayers(container.databaseId, layers)
          }
          onClose={closeContainerDetails}
        />
      );
    }

    const { databaseId, schemaName } = container;
    return (
      <SchemaDetailsPanel
        ref={scrollToPanel}
        databaseId={databaseId}
        schemaName={schemaName}
        displayName={getSchemaDisplayName(databaseId, schemaName)}
        onDisplayNameChange={(displayName) =>
          setSchemaDisplayName(databaseId, schemaName, displayName)
        }
        defaultWidth={panelWidths.schema}
        onWidthChange={handlePanelWidthChange("schema")}
        dataLayers={getDataLayers(databaseId)}
        dataLayer={getSchemaDataLayer(databaseId, schemaName)}
        onDataLayerChange={(layerId) =>
          setSchemaDataLayerId(databaseId, schemaName, layerId)
        }
        onManageDataLayers={() => {
          setPickedPath({ databaseId });
          navigate(Urls.dataStudioData({ databaseId }));
        }}
        onClose={closeContainerDetails}
      />
    );
  };

  const fieldPanel = showFieldDetails ? (
    <FieldDetailsPanel
      ref={scrollToPanel}
      field={field}
      table={table}
      error={error}
      isLoading={isLoading}
      defaultWidth={panelWidths.field}
      onWidthChange={handlePanelWidthChange("field")}
      getFieldHref={(fieldId) =>
        Urls.dataStudioData({ ...parsedParams, fieldId })
      }
      onClose={closeFieldDetails}
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
      {openContainer && renderContainerPanel(openContainer)}

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

      {showPropertyDetails && (
        <PropertyDetailsPanel
          key={`${table.id}:${selectedPropertyName}`}
          ref={scrollToPanel}
          table={table}
          propertyName={selectedPropertyName}
          defaultWidth={panelWidths.field}
          onWidthChange={handlePanelWidthChange("field")}
          onClose={() => setSelectedPropertyName(null)}
        />
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
    <Box
      ref={containerRef}
      className={S.container}
      data-testid="data-model"
      h="100%"
    >
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
            onPathChange={handlePathChange}
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
        {/* Flat, bordered metadata cards to match the drawer's sections */}
        <MetadataCardVariantProvider value="outlined">
          {drawerPanels ?? lastDrawerPanelsRef.current}
        </MetadataCardVariantProvider>
      </Drawer>
    </Box>
  );
}

/**
 * Whether an Esc keypress is meant for this page's panels. Modals, menus and
 * popovers render outside the page and handle their own Esc, and inputs use
 * it to cancel an edit.
 */
function isPageEscape(
  target: EventTarget | null,
  container: HTMLElement | null,
): boolean {
  if (!(target instanceof HTMLElement) || container == null) {
    return false;
  }
  if (target !== document.body && !container.contains(target)) {
    return false;
  }
  return !(
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.isContentEditable
  );
}

type OpenContainer =
  | { type: "database"; databaseId: DatabaseId }
  | { type: "schema"; databaseId: DatabaseId; schemaName: SchemaName };

/**
 * The database or schema whose drawer is open: the one the person clicked in
 * the tree, while the URL is still on it and nothing deeper is selected.
 */
function getOpenContainer({
  pickedPath,
  databaseId,
  schemaName,
  databaseExists,
  fieldId,
  hasSelectedItems,
  tableId,
}: {
  pickedPath: TreePath | null;
  databaseId: DatabaseId | undefined;
  schemaName: SchemaName | undefined;
  databaseExists: boolean | undefined;
  fieldId: FieldId | undefined;
  hasSelectedItems: boolean;
  tableId: TableId | undefined;
}): OpenContainer | null {
  const isContainerOnly =
    databaseExists === true &&
    tableId == null &&
    fieldId == null &&
    !hasSelectedItems;
  if (
    !isContainerOnly ||
    pickedPath == null ||
    databaseId == null ||
    pickedPath.databaseId !== databaseId ||
    pickedPath.tableId != null
  ) {
    return null;
  }
  // A picked database stays open when the tree then selects its lone schema
  if (pickedPath.schemaName == null) {
    return { type: "database", databaseId };
  }
  return pickedPath.schemaName === schemaName
    ? { type: "schema", databaseId, schemaName: pickedPath.schemaName }
    : null;
}
