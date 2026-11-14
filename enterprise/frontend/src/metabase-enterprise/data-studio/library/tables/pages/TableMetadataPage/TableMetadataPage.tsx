import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import {
  SettingsCard,
  SettingsSection,
} from "metabase/data-studio/common/components/SettingsSection";
import {
  TableDefaultSegment,
  TableRequiredFilter,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableFiltering";
import { useParams } from "metabase/router";
import { Box, Center, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";

import S from "./TableMetadataPage.module.css";
import { TableStructureSections } from "./TableStructureSections";
import { TableSubjectFields } from "./TableSubjectFields";
import { TableVisibilityFields } from "./TableVisibilityFields";

type TableMetadataPageParams = {
  tableId: string;
};

/**
 * The published table's semantic-layer settings: sections of label-and-control
 * rows, each under a heading that says what the section is for
 */
export function TableMetadataPage() {
  const params = useParams<TableMetadataPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  if (isLoading || error != null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const readOnly = !table.can_write;

  return (
    <PageContainer data-testid="table-metadata-page" gap="lg" px={0} pb={0}>
      <TableHeader table={table} px="3.5rem" />
      <Box className={S.body} flex={1} px="3.5rem" py="xxl">
        {/* Full width, like the Fields and Properties tabs' lists */}
        <Stack gap="xxxl">
          <SettingsSection title={t`What this table is`}>
            <SettingsCard>
              <TableSubjectFields table={table} readOnly={readOnly} />
            </SettingsCard>
          </SettingsSection>
          <TableStructureSections table={table} />
          <SettingsSection title={t`Default segments and required filter`}>
            <SettingsCard>
              <TableDefaultSegment table={table} readOnly={readOnly} />
              <TableRequiredFilter table={table} readOnly={readOnly} />
            </SettingsCard>
          </SettingsSection>
          <SettingsSection
            title={t`Visibility`}
            description={t`The data layer decides who can find this table. Some roles and data layers hide a table from people browsing data.`}
          >
            <SettingsCard>
              <TableVisibilityFields table={table} readOnly={readOnly} />
            </SettingsCard>
          </SettingsSection>
        </Stack>
      </Box>
    </PageContainer>
  );
}
