import { useWindowEvent } from "@mantine/hooks";
import { useRef, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from "metabase/data-studio/common/components/SettingsSection";
import { PropertyDetailsPanel } from "metabase/data-studio/data-model/pages/DataModel/PropertyDetailsPanel";
import { CustomPropertiesSection } from "metabase/data-studio/data-model/pages/DataModel/TableSection/CustomProperties/CustomPropertiesSection";
import { EntityCustomPropertiesSection } from "metabase/data-studio/data-model/pages/DataModel/TableSection/CustomProperties/EntityCustomPropertiesSection";
import { TablePropertyList } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TablePropertyList";
import { DRAWER_PANEL_WIDTH } from "metabase/data-studio/data-model/pages/DataModel/constants";
import {
  PropertySelectionProvider,
  usePropertySelection,
} from "metabase/data-studio/data-model/pages/DataModel/contexts/PropertySelectionContext";
import { isPageEscape } from "metabase/data-studio/data-model/pages/DataModel/utils";
import { MetadataCardVariantProvider } from "metabase/metadata/components";
import { useTableStructures } from "metabase/metadata/table-structure";
import { Navigate, useParams } from "metabase/router";
import { Box, Center, Drawer, Stack, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { TableHeader } from "../../components/TableHeader";
import { TableListBody } from "../../components/TableListBody";
import MetadataS from "../TableMetadataPage/TableMetadataPage.module.css";

import S from "./TablePropertiesPage.module.css";
import { useTableCustomProperties } from "./use-table-custom-properties";

type TablePropertiesPageParams = {
  tableId: string;
};

/**
 * PROTOTYPE: mocked. A published table's custom properties: for a table that
 * stores them, the properties (each opening its details in a drawer) and how
 * they're stored; for a table whose records have them, a sample record's
 * values.
 */
export function TablePropertiesPage() {
  const params = useParams<TablePropertiesPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  if (isLoading || error != null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PropertySelectionProvider>
      <TableProperties table={table} />
    </PropertySelectionProvider>
  );
}

function TableProperties({ table }: { table: Table }) {
  const { kind, isLoading } = useTableCustomProperties(table);

  if (isLoading) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }
  // The tab only shows for tables with custom properties
  if (kind == null) {
    return <Navigate to={Urls.dataStudioTableMetadata(table.id)} replace />;
  }

  return kind === "stores" ? (
    <StoredProperties table={table} />
  ) : (
    <PageContainer data-testid="table-properties-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <Box className={MetadataS.body} flex={1} px="3.5rem" py="xxl">
        <Stack gap="xxxl" maw={rem(800)}>
          <SettingsSection
            title={t`Custom properties`}
            description={t`Extra properties each record has, kept in another table.`}
          >
            <SettingsCard>
              <SettingsRow>
                <EntityCustomPropertiesSection table={table} />
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>
        </Stack>
      </Box>
    </PageContainer>
  );
}

/**
 * A custom property table's properties, listed like the Fields tab, with how
 * they're stored below. A property's details open in a drawer, as in
 * Connected data.
 */
function StoredProperties({ table }: { table: Table }) {
  const { setEavBinding } = useTableStructures();
  const { selectedPropertyName, setSelectedPropertyName } =
    usePropertySelection(table.id);
  const [panelWidth, setPanelWidth] = useState(DRAWER_PANEL_WIDTH.field);
  const containerRef = useRef<HTMLDivElement>(null);
  const readOnly = !table.can_write;
  const closeProperty = () => setSelectedPropertyName(null);

  useWindowEvent("keydown", (event) => {
    if (
      event.key === "Escape" &&
      isPageEscape(event.target, containerRef.current)
    ) {
      closeProperty();
    }
  });

  return (
    <Box ref={containerRef} className={S.drawerContainer} h="100%">
      <PageContainer data-testid="table-properties-page" gap="lg" px={0} pb={0}>
        <TableHeader table={table} px="3.5rem" />
        <TableListBody hasPageBackground>
          <Stack gap="xxxl">
            <TablePropertyList table={table} variant="page" />
            <SettingsSection
              title={t`How this table holds them`}
              description={t`One row per property value. These columns say which record it's for, which property, and the value.`}
            >
              <CustomPropertiesSection
                table={table}
                disabled={readOnly}
                layout="form"
                onChange={(eav) => setEavBinding(table, eav)}
              />
            </SettingsSection>
          </Stack>
        </TableListBody>
      </PageContainer>
      {/* Non-modal, like Connected data's: the list stays interactive */}
      <Drawer
        opened={selectedPropertyName != null}
        onClose={closeProperty}
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
          {selectedPropertyName != null && (
            <PropertyDetailsPanel
              table={table}
              propertyName={selectedPropertyName}
              defaultWidth={panelWidth}
              onWidthChange={setPanelWidth}
              onClose={closeProperty}
            />
          )}
        </MetadataCardVariantProvider>
      </Drawer>
    </Box>
  );
}
