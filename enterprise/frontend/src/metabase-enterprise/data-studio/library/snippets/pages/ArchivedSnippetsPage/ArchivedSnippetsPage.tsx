import { useCallback, useState } from "react";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { useBuildSnippetTree } from "metabase/data-studio/common/hooks/use-build-snippet-tree";
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
import type { CollectionItem } from "metabase-types/api";

import { useSnippetHost } from "../../host";

import { useColumnDef } from "./hooks/useColumnDef";

export function ArchivedSnippetsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { worktreeId, rootUrl, getSnippetUrl, hasHostChrome } =
    useSnippetHost();
  const {
    tree: snippetTree,
    isLoading,
    error,
  } = useBuildSnippetTree({
    archived: true,
    worktreeId: worktreeId ?? undefined,
  });
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [updateSnippet] = useUpdateSnippetMutation();

  const handleUnarchiveClick = useCallback(
    async (item: Pick<CollectionItem, "id" | "name">) => {
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
        showAppSwitcher={!hasHostChrome}
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link to={rootUrl}>{t`SQL snippets`}</Link>
            {t`Archived snippets`}
          </DataStudioBreadcrumbs>
        }
        px={hasHostChrome ? 0 : "3.5rem"}
        py={0}
      />
      <Stack
        bg="background_page-secondary"
        data-testid="archived-snippets-page"
        pb="2rem"
        px={hasHostChrome ? 0 : "3.5rem"}
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
              renderRowLink={(row, props) => {
                const { data } = row.original;

                if (data.model === "snippet") {
                  return (
                    <Link to={getSnippetUrl(Number(data.id))} {...props} />
                  );
                }

                return props.children;
              }}
            />
          )}
        </Card>
      </Stack>
    </SectionLayout>
  );
}
