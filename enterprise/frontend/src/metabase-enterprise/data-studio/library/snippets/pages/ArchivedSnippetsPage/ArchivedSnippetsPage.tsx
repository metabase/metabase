import { useCallback, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Card,
  Center,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useBuildSnippetTree } from "metabase/data-studio/common/hooks/use-build-snippet-tree";
import type { CollectionItem } from "metabase-types/api";

import { useColumnDef } from "./hooks/useColumnDef";

export function ArchivedSnippetsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const {
    tree: snippetTree,
    isLoading,
    error,
  } = useBuildSnippetTree({ archived: true });
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [updateSnippet] = useUpdateSnippetMutation();

  const handleUnarchiveClick = useCallback(
    async (item: CollectionItem) => {
      try {
        await updateSnippet({
          id: item.id,
          archived: false,
        }).unwrap();

        sendSuccessToast(t`"${item.name}" unarchived`);
      } catch (error) {
        sendErrorToast(getErrorMessage(error, t`Failed to unarchive snippet`));
      }
    },
    [sendErrorToast, sendSuccessToast, updateSnippet],
  );
  const columns = useColumnDef({ handleUnarchiveClick });

  const treeTableInstance = useTreeTableInstance({
    data: snippetTree,
    columns,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    defaultExpanded: true,
  });

  if (isLoading || error) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SectionLayout>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link to={Urls.dataStudioLibrary()}>{t`SQL snippets`}</Link>
            {t`Archived snippets`}
          </DataStudioBreadcrumbs>
        }
        px="3.5rem"
        py={0}
      />
      <Stack
        bg="background-secondary"
        data-testid="archived-snippets-page"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <TextInput
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          bdrs="md"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <Card withBorder p={0}>
          {isLoading ? (
            <TreeTableSkeleton columnWidths={[0.6, 0.2, 0.05]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              emptyState={t`No archived snippets`}
              onRowClick={(row) => {
                const { data } = row.original;

                if (data.model === "empty-state") {
                  return;
                }

                if (row.getCanExpand()) {
                  row.toggleExpanded();
                  return;
                }
              }}
              getRowHref={(row) => {
                const { data } = row.original;

                if (data.model === "snippet") {
                  const snippetId = Number(data.id);
                  return Urls.dataStudioSnippet(snippetId);
                }

                return null;
              }}
            />
          )}
        </Card>
      </Stack>
    </SectionLayout>
  );
}
