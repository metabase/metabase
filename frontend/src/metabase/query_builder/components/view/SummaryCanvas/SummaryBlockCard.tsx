import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Center,
  Flex,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import type Question from "metabase-lib/v1/Question";

import S from "./SummaryCanvas.module.css";
import {
  buildBlockQuery,
  getBlockQuestion,
  getBlockTitle,
  hasBlockContent,
} from "./blocks";
import type {
  SummaryBase,
  SummaryBlock,
  SummaryDragItem,
  SummaryDropTarget,
} from "./types";
import { useBlockResult } from "./use-block-result";

/** The class of a block's header, which is the handle for moving it on the grid. */
export const BLOCK_DRAG_HANDLE_CLASS = "summary-block-drag-handle";

type SummaryBlockCardProps = {
  dataQuestion: Question;
  base: SummaryBase;
  block: SummaryBlock;
  isSelected: boolean;
  refreshKey: number;
  draggedItem: SummaryDragItem | null;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

/** One summary on the canvas: its own query, result, loading state, and errors. */
export function SummaryBlockCard({
  dataQuestion,
  base,
  block,
  isSelected,
  refreshKey,
  draggedItem,
  onSelect,
  onDuplicate,
  onRemove,
}: SummaryBlockCardProps) {
  const blockQueryResult = useMemo(
    () => buildBlockQuery(base, block),
    [base, block],
  );
  const hasContent = hasBlockContent(block);
  const blockQuestion = useMemo(
    () =>
      blockQueryResult.query != null && hasContent
        ? getBlockQuestion(dataQuestion, base, block, blockQueryResult.query)
        : null,
    [dataQuestion, base, block, blockQueryResult, hasContent],
  );
  const { series, error, isRunning, refresh, cancel } = useBlockResult(
    blockQuestion,
    refreshKey,
  );
  const title = getBlockTitle(base, block, blockQueryResult.query);

  const { setNodeRef, isOver } = useDroppable({
    id: `summary-block:${block.id}`,
    data: {
      target: { type: "block", blockId: block.id } satisfies SummaryDropTarget,
    },
  });
  const canDrop = draggedItem != null && draggedItem.kind !== "chip";

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.block, {
        [S.blockSelected]: isSelected,
        [S.blockDropTarget]: canDrop && isOver,
      })}
      data-testid="summary-block"
      data-selected={isSelected}
      onMouseDown={onSelect}
    >
      <Flex
        className={cx(S.blockHeader, BLOCK_DRAG_HANDLE_CLASS)}
        align="center"
        gap="xs"
      >
        <Text fw="bold" truncate flex={1} title={title}>
          {title}
        </Text>
        {block.filters.length > 0 && (
          <Tooltip label={t`Filters that apply only to this summary`}>
            <Flex className={S.blockFilterBadge} align="center" gap={4}>
              <Icon name="filter" size={12} aria-hidden />
              {block.filters.length}
            </Flex>
          </Tooltip>
        )}
        {block.cardId != null && (
          <Tooltip label={t`Saved to the dashboard`}>
            <Icon name="dashboard" size={14} c="text-secondary" />
          </Tooltip>
        )}
        <BlockMenu
          isRunning={isRunning}
          onRefresh={refresh}
          onCancel={cancel}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </Flex>
      <Box className={S.blockBody}>
        <BlockBody
          hasContent={hasContent}
          queryError={blockQueryResult.error}
          resultError={error?.message ?? null}
          series={series}
          isRunning={isRunning}
        />
      </Box>
    </Box>
  );
}

type BlockBodyProps = {
  hasContent: boolean;
  queryError: string | null;
  resultError: string | null;
  series: ReturnType<typeof useBlockResult>["series"];
  isRunning: boolean;
};

function BlockBody({
  hasContent,
  queryError,
  resultError,
  series,
  isRunning,
}: BlockBodyProps) {
  if (!hasContent) {
    return (
      <Center h="100%">
        <Stack gap="xs" align="center" maw="16rem" ta="center">
          <Icon name="sum" c="text-secondary" />
          <Text c="text-secondary">
            {t`Add a calculation or drop a column here to group by it.`}
          </Text>
        </Stack>
      </Center>
    );
  }
  if (queryError != null) {
    return (
      <Center h="100%" p="md">
        <Stack gap="xs" align="center" ta="center">
          <Icon name="warning" c="error" />
          <Text c="text-secondary">{queryError}</Text>
        </Stack>
      </Center>
    );
  }
  if (resultError != null) {
    return (
      <Center h="100%">
        <ErrorView error={resultError} icon="warning" />
      </Center>
    );
  }
  return (
    <>
      {series && (
        <Visualization
          className={S.blockVisualization}
          rawSeries={[series]}
          isDashboard
          showTitle={false}
        />
      )}
      {isRunning && (
        <Box className={S.blockLoading}>
          <Loader size="sm" />
        </Box>
      )}
    </>
  );
}

type BlockMenuProps = {
  isRunning: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function BlockMenu({
  isRunning,
  onRefresh,
  onCancel,
  onDuplicate,
  onRemove,
}: BlockMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          size="sm"
          variant="subtle"
          aria-label={t`Summary actions`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {isRunning ? (
          <Menu.Item leftSection={<Icon name="close" />} onClick={onCancel}>
            {t`Cancel`}
          </Menu.Item>
        ) : (
          <Menu.Item leftSection={<Icon name="refresh" />} onClick={onRefresh}>
            {t`Refresh`}
          </Menu.Item>
        )}
        <Menu.Item leftSection={<Icon name="copy" />} onClick={onDuplicate}>
          {t`Duplicate`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<Icon name="trash" />}
          c="error"
          onClick={onRemove}
        >
          {t`Remove`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
