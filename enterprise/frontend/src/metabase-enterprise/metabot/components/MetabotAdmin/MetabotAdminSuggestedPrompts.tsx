import { useClipboard } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { ForwardRefLink } from "metabase/common/components/Link";
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
  Loader,
  Skeleton,
  Tooltip,
} from "metabase/ui";
import {
  useDeleteSuggestedMetabotPromptMutation,
  useGetSuggestedMetabotPromptsQuery,
  useRegenerateSuggestedMetabotPromptsMutation,
} from "metabase-enterprise/api";
import { FIXED_METABOT_IDS } from "metabase-enterprise/metabot/constants";
import * as Urls from "metabase-enterprise/urls";
import type { MetabotInfo, SuggestedMetabotPrompt } from "metabase-types/api";

export const PAGE_SIZE = 10;

export const MetabotPromptSuggestionPane = ({
  metabot,
  pageSize = PAGE_SIZE,
}: {
  metabot: Pick<MetabotInfo, "id" | "collection_id">;
  pageSize?: number;
}) => {
  const [sendToast] = useToast();

  const { handleNextPage, handlePreviousPage, page, setPage } = usePagination();
  const offset = page * pageSize;

  const { data, isLoading, error } = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabot.id,
    limit: pageSize,
    offset,
  });
  const [deletePrompt] = useDeleteSuggestedMetabotPromptMutation();
  const [regeneratePrompts, { isLoading: isRegenerating }] =
    useRegenerateSuggestedMetabotPromptsMutation();

  const handleDeletePrompt = async (promptId: SuggestedMetabotPrompt["id"]) => {
    const { error } = await deletePrompt({
      metabot_id: metabot.id,
      prompt_id: promptId,
    });

    sendToast(
      error
        ? { message: t`Error removing prompt`, icon: "warning" }
        : { message: t`Successfully removed prompt`, icon: "check" },
    );

    const newMaxPage = Math.max(
      Math.ceil(((data?.total ?? 0) - 1) / pageSize) - 1,
      0,
    );
    if (newMaxPage < page) {
      setPage(newMaxPage);
    }
  };

  const handleRegeneratePrompts = async () => {
    const { error } = await regeneratePrompts(metabot.id);
    if (error) {
      sendToast({
        message: t`Error regenerate prompts`,
        icon: "warning",
      });
    } else {
      setPage(0);
    }
  };

  const prompts = useMemo(() => data?.prompts ?? [], [data?.prompts]);
  const total = data?.total ?? 0;

  const showSkeleton = isLoading || isRegenerating;
  const rows = useMemo(() => {
    return showSkeleton
      ? new Array(pageSize)
          .fill(null)
          .map((_, id) => ({ id, isLoading: true, prompt: "" as const }))
      : prompts;
  }, [showSkeleton, pageSize, prompts]);

  return (
    <Box w="100%">
      <SettingHeader
        id="prompt-suggestions"
        title={t`Prompt suggestions`}
        description={
          metabot.collection_id
            ? t`When users open a new Metabot chat, we’ll show them a few suggested prompts based on popular models and metrics in the collection you chose.`
            : t`When users open a new Metabot chat, we’ll show them a few suggested prompts based on popular models and metrics in your instance.`
        }
      />
      <Flex gap="md" align="center">
        <Button
          disabled={isRegenerating}
          leftSection={isRegenerating && <Loader size="xs" />}
          onClick={handleRegeneratePrompts}
        >
          {isRegenerating
            ? t`Regenerating suggested prompts...`
            : t`Regenerate suggested prompts`}
        </Button>
      </Flex>
      <Box maw="80rem">
        <Table<
          | (SuggestedMetabotPrompt & { isLoading?: void })
          | { id: number; isLoading: boolean; prompt: "" }
        >
          cols={
            <>
              <col width="60%" />
              <col width="40%" />
              <col width="5.5rem" />
            </>
          }
          columns={[
            { name: "Prompt", key: "prompt", sortable: false },
            { name: "Model or metric", key: "model", sortable: false },
            { name: "", key: "trash", sortable: false },
          ]}
          rows={rows}
          rowRenderer={(row) =>
            row.isLoading ? (
              <SkeletonSuggestedPromptRow key={row.id} />
            ) : (
              <SuggestedPromptRow
                key={row.id}
                row={row as SuggestedMetabotPrompt}
                onDelete={() => handleDeletePrompt(row.id)}
                metabotId={metabot.id}
              />
            )
          }
          emptyBody={
            error ? (
              <Center my="lg" fw="bold" c="danger">
                {t`Something went wrong.`}
              </Center>
            ) : data?.total === 0 ? (
              <Center my="lg" fw="bold" c="text-tertiary">
                {t`No prompts found.`}
              </Center>
            ) : null
          }
        />
        <Flex align="center" justify="flex-end" w="100%">
          {!showSkeleton && (
            <PaginationControls
              page={page}
              pageSize={pageSize}
              itemsLength={prompts.length}
              total={total}
              showTotal
              onNextPage={handleNextPage}
              onPreviousPage={handlePreviousPage}
              data-testid="prompts-pagination"
            />
          )}
        </Flex>
      </Box>
    </Box>
  );
};

const SkeletonSuggestedPromptRow = () => (
  <Box component="tr" h="3.5rem" data-testid="prompt-loading-row">
    <td>
      <Skeleton h="1rem" natural />
    </td>
    <td>
      <Skeleton h="1rem" natural />
    </td>
    <Flex h="3.5rem" component="td" align="center" justify="flex-end">
      <Skeleton w="1.25rem" h="1rem" mr=".25rem" />
    </Flex>
  </Box>
);

const SuggestedPromptRow = ({
  row,
  onDelete,
  metabotId,
}: {
  row: SuggestedMetabotPrompt;
  onDelete: () => Promise<void>;
  metabotId: number;
}) => {
  const clipboard = useClipboard();

  return (
    <Box component="tr" mih="3.5rem">
      <Box component="td" py="1rem">
        <Flex gap="sm">{row.prompt}</Flex>
      </Box>
      <td>
        <Flex align="center" gap="sm">
          <Icon name={row.model} c="text-secondary" /> {row.model_name}
        </Flex>
      </td>
      <Box component="td" h="3.5rem">
        <Flex align="center" gap="sm">
          {metabotId === FIXED_METABOT_IDS.DEFAULT ? (
            <Tooltip label={t`Run prompt`}>
              <ActionIcon
                component={ForwardRefLink}
                to={Urls.newMetabotConversation({ prompt: row.prompt })}
                data-testid="prompt-run"
                target="_blank"
                h="sm"
              >
                <Icon name="play" size="1rem" />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Tooltip label={clipboard.copied ? t`Copied!` : t`Copy prompt`}>
              <ActionIcon
                onClick={() => clipboard.copy(row.prompt)}
                data-testid="prompt-copy"
                h="sm"
              >
                <Icon name="copy" size="1rem" />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={t`Remove prompt`}>
            <ActionIcon onClick={onDelete} data-testid="prompt-remove" h="sm">
              <Icon name="trash" size="1rem" />
            </ActionIcon>
          </Tooltip>
        </Flex>
      </Box>
    </Box>
  );
};
