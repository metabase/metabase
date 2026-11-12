import { t } from "ttag";

import { DatabaseInfoSection } from "metabase/admin/databases/components/DatabaseInfoSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import {
  TableDefaultSegment,
  TableRequiredFilter,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableFiltering";
import { useParams } from "metabase/router";
import { Box, Center, Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TableHeader } from "../../components/TableHeader";

import S from "./TableMetadataPage.module.css";
import { TableStructureSections } from "./TableStructureSections";
import { TableSubjectFields } from "./TableSubjectFields";

type TableMetadataPageParams = {
  tableId: string;
};

/**
 * The published table's semantic-layer settings, laid out like a database's
 * admin settings: a heading and description beside each section's inputs.
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
        <Flex direction="column" gap="xxl" maw="64.25rem" mx="auto">
          <DatabaseInfoSection
            name={t`What this table is`}
            description={t`What each row is about, and what to call one row and many rows in plain words.`}
            contentPx="xxxl"
            cardRadius="lg"
          >
            <TableSubjectFields table={table} readOnly={readOnly} />
          </DatabaseInfoSection>
          <TableStructureSections table={table} />
          <DatabaseInfoSection
            name={t`Default segments and required filter`}
            description={t`What every question on this table starts from. A required filter is helpful for very large tables, to prevent people from accidentally querying more data than they intend to.`}
            contentPx="xxxl"
            cardRadius="lg"
          >
            <Stack gap="xxl">
              <TableDefaultSegment table={table} readOnly={readOnly} />
              <TableRequiredFilter table={table} readOnly={readOnly} />
            </Stack>
          </DatabaseInfoSection>
        </Flex>
      </Box>
    </PageContainer>
  );
}
