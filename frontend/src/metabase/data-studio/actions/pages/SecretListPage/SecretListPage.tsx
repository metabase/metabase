import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListActionSecretsQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Button,
  Card,
  Ellipsified,
  Flex,
  Icon,
  Menu,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { ActionSecret, ActionSecretTemplate } from "metabase-types/api";

import { ActionSecretModal } from "../../components/ActionSecretModal";
import { ActionSecretTemplateModal } from "../../components/ActionSecretTemplateModal";
import { ActionsTabs } from "../../components/ActionsTabs";
import { DeleteActionSecretModal } from "../../components/DeleteActionSecretModal";

type ActionSecretModalState =
  | { type: "pick" }
  | { type: "create"; template: ActionSecretTemplate | undefined }
  | { type: "edit"; secret: ActionSecret }
  | { type: "delete"; secret: ActionSecret };

export function SecretListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [modal, setModal] = useState<ActionSecretModalState>();
  const { data: secrets = [], error, isLoading } = useListActionSecretsQuery();

  const columns = useMemo<TreeTableColumnDef<ActionSecret>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 120,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: t`Created at`,
        minWidth: 120,
        cell: ({ row }) => <DateTime value={row.original.created_at} />,
      },
      {
        id: "creator",
        accessorFn: (secret) => secret.creator?.common_name ?? "",
        header: t`Created by`,
        minWidth: 120,
        cell: ({ row }) => (
          <Ellipsified>{row.original.creator?.common_name}</Ellipsified>
        ),
      },
      {
        id: "actions",
        header: "",
        width: 48,
        cell: ({ row }) => (
          <ActionSecretMenu
            secret={row.original}
            onEdit={() => setModal({ type: "edit", secret: row.original })}
            onDelete={() => setModal({ type: "delete", secret: row.original })}
          />
        ),
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: secrets,
    columns,
    getNodeId: (secret) => String(secret.id),
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const emptyMessage = getEmptyMessage(secrets.length, searchQuery);

  return (
    <PageContainer data-testid="action-secret-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Data actions`}</DataStudioBreadcrumbs>
        }
        tabs={<ActionsTabs />}
        py={0}
        mb="lg"
      />
      <Stack style={{ overflow: "hidden" }}>
        <Flex gap="0.5rem">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="sm"
            flex="1"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Button
            size="lg"
            leftSection={<Icon name="add" />}
            onClick={() => setModal({ type: "pick" })}
          >{t`New`}</Button>
        </Flex>
        <Flex direction="column" flex={1} mih={0}>
          <Card withBorder p={0}>
            {isLoading ? (
              <TreeTableSkeleton columnWidths={[0.45, 0.25, 0.25, 0.05]} />
            ) : (
              <TreeTable
                instance={treeTableInstance}
                emptyState={
                  emptyMessage != null ? (
                    <ListEmptyState label={emptyMessage} />
                  ) : null
                }
              />
            )}
          </Card>
        </Flex>
      </Stack>
      {modal?.type === "pick" && (
        <ActionSecretTemplateModal
          onSelect={(template) => setModal({ type: "create", template })}
          onClose={() => setModal(undefined)}
        />
      )}
      {modal?.type === "create" && (
        <ActionSecretModal
          template={modal.template}
          onClose={() => setModal(undefined)}
        />
      )}
      {modal?.type === "edit" && (
        <ActionSecretModal
          secret={modal.secret}
          onClose={() => setModal(undefined)}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteActionSecretModal
          secret={modal.secret}
          onClose={() => setModal(undefined)}
        />
      )}
    </PageContainer>
  );
}

function getEmptyMessage(secretCount: number, searchQuery: string) {
  if (secretCount === 0) {
    return t`No secrets yet`;
  }
  if (searchQuery.length > 0) {
    return t`No secrets found`;
  }
  return null;
}

type ActionSecretMenuProps = {
  secret: ActionSecret;
  onEdit: () => void;
  onDelete: () => void;
};

function ActionSecretMenu({ secret, onEdit, onDelete }: ActionSecretMenuProps) {
  const handleTargetClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu>
      <Menu.Target>
        <MoreMenuButton
          aria-label={t`${secret.name} options`}
          onClick={handleTargetClick}
        />
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
          {t`Edit`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={onDelete}>
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
