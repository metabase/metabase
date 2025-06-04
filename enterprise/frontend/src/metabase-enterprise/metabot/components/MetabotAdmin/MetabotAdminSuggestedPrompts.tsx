import { useCallback, useEffect, useMemo } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { Table } from "metabase/common/components/Table";
import { useToast } from "metabase/common/hooks";
import { PaginationControls } from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";
import { useDispatch } from "metabase/lib/redux";
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
  useRefreshSuggestedMetabotPromptsMutation,
} from "metabase-enterprise/api";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import type { MetabotId, SuggestedMetabotPrompt } from "metabase-types/api";

import type { MetabotAdminPageProps } from "./MetabotAdminPage";

function usePaginationParamSync({
  paramName,
  disabled,
  page,
  setPage,
  pageSize,
  totalItems,
  location,
}: {
  paramName: string;
  disabled: boolean;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  totalItems: number;
  location: MetabotAdminPageProps["location"];
}) {
  const dispatch = useDispatch();

  const setUrlToPage = useCallback(
    (page: number, method: "push" | "replace") => {
      // TODO: construct url from Url utils
      const url = new URL(
        location.pathname + location.search,
        window.location.origin,
      );
      url.searchParams.delete(paramName);
      if (page && page > 0) {
        url.searchParams.set(paramName, String(page + 1));
      }
      const urlUpdateFn = method === "replace" ? replace : push;
      dispatch(urlUpdateFn(url));
    },
    [location, paramName, dispatch],
  );

  useEffect(
    function syncCurrentPageToUrl() {
      setUrlToPage(page, "push");
    },
    [page, setUrlToPage],
  );

  useEffect(
    function preventInvalidPage() {
      if (disabled) {
        return;
      }
      const newMaxPage = Math.max(
        Math.ceil((totalItems ?? 0) / pageSize) - 1,
        0,
      );
      if (newMaxPage < page) {
        setPage(newMaxPage);
        setUrlToPage(newMaxPage, "replace");
      }
    },
    [totalItems, disabled, page, pageSize, setPage, setUrlToPage],
  );
}

export const MetabotPromptSuggestionPane = ({
  metabotId,
  location,
}: {
  metabotId: MetabotId;
  location: MetabotAdminPageProps["location"];
}) => {
  const dispatch = useDispatch();
  const metabot = useMetabotAgent();

  const [sendToast] = useToast();

  const urlParams = new URLSearchParams(location.search);
  const initialPage = parseInt(urlParams.get("page") ?? "1", 10) - 1;

  const { handleNextPage, handlePreviousPage, page, setPage } =
    usePagination(initialPage);
  const pageSize = 2; // TODO: adjust page size once we have more data
  const offset = page * pageSize;

  const { data, isLoading, error } = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: pageSize,
    offset,
  });
  const [deletePrompt] = useDeleteSuggestedMetabotPromptMutation();
  const [refreshPrompts, { isLoading: isRefreshing }] =
    useRefreshSuggestedMetabotPromptsMutation();

  usePaginationParamSync({
    paramName: "page",
    disabled: isLoading,
    page,
    setPage,
    pageSize,
    totalItems: data?.total ?? 0,
    location,
  });

  const handleDeletePrompt = async (promptId: SuggestedMetabotPrompt["id"]) => {
    const { error } = await deletePrompt({
      metabot_id: metabotId,
      prompt_id: promptId,
    });

    sendToast(
      error
        ? { message: t`Error removing prompt`, icon: "warning" }
        : { message: t`Succesfully removed prompt`, icon: "check" },
    );
  };

  const handleRunPrompt = (prompt: string) => {
    dispatch(push("/"));
    metabot.resetConversation();
    metabot.setVisible(true);
    metabot.submitInput(prompt);
  };

  const handleRefreshPrompts = async () => {
    const { error } = await refreshPrompts(metabotId);
    if (error) {
      sendToast({
        message: t`Error refreshing prompts`,
        icon: "warning",
      });
    } else {
      setPage(0);
    }
  };

  const prompts = useMemo(() => data?.prompts ?? [], [data?.prompts]);
  const total = data?.total ?? 0;

  const showSkeleton = isLoading || isRefreshing;
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
        description={t`When users open a new Metabot chat, we’ll randomly show them a few suggested prompts based on the models and metrics in the collection you chose.`}
      />
      <Flex gap="md" align="center">
        <Button
          disabled={isRefreshing}
          leftSection={isRefreshing && <Loader size="xs" />}
          onClick={handleRefreshPrompts}
        >
          {isRefreshing
            ? t`Refreshing prompts suggestions...`
            : t`Refresh prompts suggestions`}
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
                onRunPrompt={() => {
                  handleRunPrompt(row.prompt);
                }}
              />
            )
          }
          emptyBody={
            error ? (
              <Center my="lg" fw="bold" c="danger">
                {t`Something went wrong.`}
              </Center>
            ) : data?.total === 0 ? (
              <Center my="lg" fw="bold" c="text-light">
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
            />
          )}
        </Flex>
      </Box>
    </Box>
  );
};

const SkeletonSuggestedPromptRow = () => (
  <Box component="tr" h="3.5rem">
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
  onRunPrompt,
}: {
  row: SuggestedMetabotPrompt;
  onDelete: () => Promise<void>;
  onRunPrompt: () => void;
}) => (
  <Box component="tr" mih="3.5rem">
    <Box component="td" py="1rem">
      <Flex gap="sm">{row.prompt}</Flex>
    </Box>
    <td>
      <Flex align="center" gap="sm">
        <Icon name={row.model} c="text-medium" /> {row.model_name}
      </Flex>
    </td>
    <Box component="td" h="3.5rem">
      <Flex align="center" gap="sm">
        <Tooltip label={t`Run prompt`}>
          <ActionIcon onClick={onRunPrompt} h="sm">
            <Icon name="sql" size="1rem" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Remove prompt`}>
          <ActionIcon onClick={onDelete} h="sm">
            <Icon name="trash" size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Box>
  </Box>
);
