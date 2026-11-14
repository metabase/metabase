import { useEffect, useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useMetadataToasts } from "metabase/common/hooks";
import { MoreMenu } from "metabase/data-studio/common/components/MoreMenu/MoreMenu";
import { PublishedTableBreadcrumbs } from "metabase/data-studio/common/components/PublishedTableBreadcrumbs";
import {
  HierarchyDefinitionFields,
  HierarchyOptionsFields,
  getHierarchyDraft,
  isHierarchyDraftComplete,
  toHierarchy,
  useLevelColumns,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/HierarchyList";
import {
  type Hierarchy,
  createHierarchyId,
  useTableHierarchies,
} from "metabase/metadata/hierarchies";
import { Navigate, useNavigate, useParams } from "metabase/router";
import { Button, Card, Center, Group, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

const NAME_MAX_LENGTH = 254;

type TableHierarchyPageParams = {
  tableId: string;
  hierarchyId?: string;
};

/** PROTOTYPE: mocked. A new or saved hierarchy as its own page */
export function TableHierarchyPage() {
  const params = useParams<TableHierarchyPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });
  const { hierarchies } = useTableHierarchies(table);
  const hierarchy =
    params.hierarchyId != null
      ? hierarchies.find(({ id }) => id === params.hierarchyId)
      : undefined;
  const isMissing = params.hierarchyId != null && table != null && !hierarchy;

  // Just deleted, or a stale link: the list is where to go
  if (isMissing) {
    return <Navigate to={Urls.dataStudioTableHierarchies(table.id)} replace />;
  }

  if (isLoading || error || !table) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    // Fresh form state per hierarchy
    <HierarchyPage
      key={hierarchy?.id ?? "new"}
      table={table}
      hierarchy={hierarchy}
    />
  );
}

/**
 * Laid out like a segment group's page: the name in the header, then the
 * kind, the levels or parent key, and the display options
 */
function HierarchyPage({
  table,
  hierarchy,
}: {
  table: Table;
  /** The hierarchy to edit; none makes a new one */
  hierarchy: Hierarchy | undefined;
}) {
  const navigate = useNavigate();
  const { save, remove } = useTableHierarchies(table);
  const { sendSuccessToast } = useMetadataToasts();
  const { columns } = useLevelColumns(table);
  const listUrl = Urls.dataStudioTableHierarchies(table.id);
  const [name, setName] = useState(hierarchy?.name ?? "");
  const [initialDraft] = useState(() => getHierarchyDraft(hierarchy));
  const [draft, setDraft] = useState(initialDraft);
  const [isLeaving, setIsLeaving] = useState(false);

  const isDirty =
    name.trim() !== (hierarchy?.name ?? "") ||
    JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const canSave = isHierarchyDraftComplete(draft, columns);

  // Saved, deleted, or cancelled: go once the leave guard is off
  const leave = () => setIsLeaving(true);
  useEffect(() => {
    if (isLeaving) {
      navigate(listUrl);
    }
  }, [isLeaving, listUrl, navigate]);

  const handleSave = () => {
    save({
      ...toHierarchy(draft, {
        id: hierarchy?.id ?? createHierarchyId(),
        // An unnamed hierarchy takes the placeholder's name
        name: name.trim() || t`New hierarchy`,
        columns,
      }),
      // Saving a sync hierarchy makes it the admin's, but sync still knows it
      syncKey: hierarchy?.syncKey,
    });
    sendSuccessToast(hierarchy ? t`Hierarchy updated` : t`Hierarchy created`);
    leave();
  };

  const handleDelete = () => {
    if (hierarchy) {
      remove(hierarchy);
      sendSuccessToast(t`Hierarchy deleted`);
      leave();
    }
  };
  // At the bottom, after the cards
  const actions = (isDirty || !hierarchy) && (
    <Group gap="sm">
      <Button onClick={leave}>{t`Cancel`}</Button>
      <Button variant="filled" disabled={!canSave} onClick={handleSave}>
        {t`Save`}
      </Button>
    </Group>
  );

  return (
    <PageContainer data-testid="hierarchy-page" gap="xxl">
      <PaneHeader
        data-testid="hierarchy-pane-header"
        icon="network"
        title={
          <PaneHeaderInput
            initialValue={hierarchy?.name ?? ""}
            isOptional
            maxLength={NAME_MAX_LENGTH}
            onContentChange={setName}
            placeholder={t`New hierarchy`}
            autoFocus={!hierarchy}
          />
        }
        menu={
          hierarchy && (
            <MoreMenu
              onRemove={handleDelete}
              ariaLabel={t`Hierarchy actions`}
              removeLabel={t`Delete hierarchy`}
              removeTitle={t`Delete this hierarchy?`}
              removeMessage={t`Its columns stay; only the hierarchy is deleted.`}
            />
          )
        }
        breadcrumbs={
          <PublishedTableBreadcrumbs
            table={table}
            entityName={hierarchy?.name}
            newEntityLabel={t`New hierarchy`}
            tableListUrl={listUrl}
          />
        }
      />
      {/* The page scrolls; cards keep their full height */}
      <Card withBorder p="xxl" flex="0 0 auto">
        <Stack gap="lg" maw={720}>
          <Stack gap="xs">
            <Title order={4}>{t`Setup`}</Title>
            <Text c="text-secondary">
              {t`Hierarchies can power drill-down, make table rows expandable, and offer better dashboard filters.`}
            </Text>
          </Stack>
          <Stack gap="xxl">
            <HierarchyDefinitionFields
              draft={draft}
              fields={table.fields ?? []}
              columns={columns}
              onChange={setDraft}
            />
          </Stack>
        </Stack>
      </Card>
      <Card withBorder p="xxl" flex="0 0 auto">
        <Stack maw={720}>
          <HierarchyOptionsFields
            draft={draft}
            columns={columns}
            onChange={setDraft}
          />
        </Stack>
      </Card>
      {actions && (
        <Group justify="flex-end" flex="0 0 auto">
          {actions}
        </Group>
      )}
      <LeaveRouteConfirmModal isEnabled={isDirty && !isLeaving} />
    </PageContainer>
  );
}
