import { useMemo, useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  useDeleteSearchPromptMutation,
  useListSearchPromptsQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { Table } from "metabase/common/components/Table";
import { useToast } from "metabase/common/hooks";
import { usePagination } from "metabase/common/hooks/use-pagination";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import type { SearchPromptEntity, SearchPromptType } from "metabase-types/api";

import { SearchPromptEntityList } from "./SearchPromptEntityList";
import { SearchPromptModal } from "./SearchPromptModal";

export const PAGE_SIZE = 10;

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; searchPrompt: SearchPromptEntity }
  | { kind: "delete"; searchPrompt: SearchPromptEntity }
  | null;

export function SearchPromptsPage() {
  return (
    <SettingsPageWrapper title={t`Search prompts`}>
      <SearchPromptSection type="sources" heading={t`Sources`} />
      <SearchPromptSection type="canonical" heading={t`Canonical entity`} />
    </SettingsPageWrapper>
  );
}

function SearchPromptSection({
  type,
  heading,
}: {
  type: SearchPromptType;
  heading: string;
}) {
  const [sendToast] = useToast();
  const { handleNextPage, handlePreviousPage, page, setPage } = usePagination();
  const offset = page * PAGE_SIZE;

  const [modal, setModal] = useState<ModalState>(null);

  const { data, isLoading, error } = useListSearchPromptsQuery({
    limit: PAGE_SIZE,
    offset,
    type,
  });
  const [deleteSearchPrompt, { isLoading: isDeleting }] =
    useDeleteSearchPromptMutation();

  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;

  const handleDelete = async (searchPrompt: SearchPromptEntity) => {
    const { error } = await deleteSearchPrompt(searchPrompt.id);

    sendToast(
      error
        ? {
            message: t`Error deleting search prompt`,
            icon: "warning",
            toastColor: "danger",
          }
        : { message: t`Search prompt deleted`, icon: "check" },
    );

    if (!error) {
      setModal(null);
      const newMaxPage = Math.max(Math.ceil((total - 1) / PAGE_SIZE) - 1, 0);
      if (newMaxPage < page) {
        setPage(newMaxPage);
      }
    }
  };

  return (
    <Box maw="80rem" mb="xl">
      <Flex justify="space-between" align="center" mb="sm">
        <Text fw="bold" fz="lg">
          {heading}
        </Text>
        <Button
          variant="filled"
          leftSection={<Icon name="add" />}
          onClick={() => setModal({ kind: "create" })}
        >
          {t`New search prompt`}
        </Button>
      </Flex>

      <Table<SearchPromptEntity>
        cols={
          <>
            <col width="2.5rem" />
            <col width="45%" />
            <col width="45%" />
            <col width="5.5rem" />
          </>
        }
        columns={[
          { name: "", key: "verified", sortable: false },
          { name: t`Prompt`, key: "prompt", sortable: false },
          { name: t`Entities`, key: "entities", sortable: false },
          { name: "", key: "actions", sortable: false },
        ]}
        rows={rows}
        rowRenderer={(row) => (
          <SearchPromptRow
            key={row.id}
            row={row}
            onEdit={() => setModal({ kind: "edit", searchPrompt: row })}
            onDelete={() => setModal({ kind: "delete", searchPrompt: row })}
          />
        )}
        emptyBody={
          error ? (
            <Center my="lg" fw="bold" c="danger">
              {t`Something went wrong.`}
            </Center>
          ) : !isLoading && total === 0 ? (
            <Center my="lg" fw="bold" c="text-tertiary">
              {t`No search prompts yet.`}
            </Center>
          ) : null
        }
      />

      <Flex justify="flex-end" w="100%">
        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          itemsLength={rows.length}
          total={total}
          showTotal
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          data-testid={`search-prompts-pagination-${type}`}
        />
      </Flex>

      {(modal?.kind === "create" || modal?.kind === "edit") && (
        <SearchPromptModal
          searchPrompt={modal.kind === "edit" ? modal.searchPrompt : undefined}
          type={type}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "delete" && (
        <ConfirmModal
          opened
          title={t`Delete this search prompt?`}
          message={t`This can't be undone.`}
          confirmButtonText={t`Delete`}
          confirmButtonProps={{ disabled: isDeleting }}
          onConfirm={() => handleDelete(modal.searchPrompt)}
          onClose={() => setModal(null)}
        />
      )}
    </Box>
  );
}

function SearchPromptRow({
  row,
  onEdit,
  onDelete,
}: {
  row: SearchPromptEntity;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Box
      component="tr"
      mih="3.5rem"
      onClick={onEdit}
      style={{ cursor: "pointer" }}
      data-testid="search-prompt-row"
    >
      <Box component="td" pr={0}>
        {row.verified ? (
          <Tooltip label={t`Verified`}>
            <Icon
              name="verified_filled"
              c="brand"
              data-testid="search-prompt-verified"
            />
          </Tooltip>
        ) : null}
      </Box>
      <Box component="td" py="md">
        {row.prompt}
      </Box>
      <Box component="td" py="md">
        <SearchPromptEntityList entities={row.entities} />
      </Box>
      <Box component="td">
        <Tooltip label={t`Delete`}>
          <ActionIcon
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            data-testid="search-prompt-delete"
          >
            <Icon name="trash" size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Box>
    </Box>
  );
}
