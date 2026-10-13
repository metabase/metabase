import { useState } from "react";
import { t } from "ttag";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { CardId } from "metabase-types/api";

import S from "./SummaryCanvas.module.css";
import type {
  SummaryBase,
  SummaryCanvasDashboard,
  SummaryCanvasState,
} from "./types";
import { useSaveSummaryCanvas } from "./use-save-canvas";
import {
  getDataLabel,
  getSourceExpressionLabels,
  getSourceFilterLabels,
} from "./utils";

type CanvasToolbarProps = {
  dataQuestion: Question;
  base: SummaryBase;
  canvas: SummaryCanvasState;
  onAddBlock: () => void;
  onRefreshAll: () => void;
  onShowData: () => void;
  onSaved: (
    dashboard: SummaryCanvasDashboard,
    cardIds: Map<string, CardId>,
    removedCardIds: CardId[],
  ) => void;
  onDashboardMissing: () => void;
};

export function CanvasToolbar({
  dataQuestion,
  base,
  canvas,
  onAddBlock,
  onRefreshAll,
  onShowData,
  onSaved,
  onDashboardMissing,
}: CanvasToolbarProps) {
  const dispatch = useDispatch();
  const [isCreatingDashboard, setIsCreatingDashboard] = useState(false);
  const { save, isSaving } = useSaveSummaryCanvas();
  const { dashboard } = canvas;

  const showToast = (message: string, isError = false) =>
    dispatch(
      addUndo(
        isError
          ? { icon: "warning", toastColor: "error", message }
          : { message },
      ),
    );

  const handleSave = async (targetDashboard: SummaryCanvasDashboard) => {
    const removedCardIds = canvas.removedCardIds;
    try {
      const result = await save({
        dashboard: targetDashboard,
        dataQuestion,
        base,
        blocks: canvas.blocks,
        removedCardIds,
      });
      if (result.status === "dashboard-missing") {
        onDashboardMissing();
        showToast(
          t`${targetDashboard.name} is no longer available. Save again to create a new dashboard.`,
          true,
        );
        return;
      }
      const { cardIds, skippedCount, failedCount, isLayoutSaved } = result;
      onSaved(targetDashboard, cardIds, isLayoutSaved ? removedCardIds : []);
      if (failedCount > 0 || !isLayoutSaved) {
        showToast(
          t`Some summaries couldn't be saved to ${targetDashboard.name}. Try again.`,
          true,
        );
      } else if (skippedCount > 0) {
        showToast(
          t`Saved to ${targetDashboard.name}. Empty summaries and summaries with errors were left as they were.`,
        );
      } else {
        showToast(t`Saved to ${targetDashboard.name}`);
      }
    } catch {
      showToast(t`Couldn't save these summaries. Try again.`, true);
    }
  };

  return (
    <Box className={S.toolbar}>
      <Flex align="center" justify="space-between" gap="md" wrap="wrap">
        <Group gap="sm" wrap="nowrap" miw={0}>
          <Text fw={700} size="lg" component="h2" truncate>
            {t`Summaries of ${getDataLabel(dataQuestion)}`}
          </Text>
          {dashboard && (
            <Tooltip
              label={t`Open the dashboard these summaries were saved to`}
            >
              <Button
                component={ForwardRefLink}
                to={Urls.dashboard(dashboard)}
                size="compact-sm"
                variant="light"
                leftSection={<Icon name="dashboard" size={12} />}
              >
                {dashboard.name}
              </Button>
            </Tooltip>
          )}
        </Group>
        <Group gap="sm">
          <Button
            variant="subtle"
            leftSection={<Icon name="refresh" />}
            onClick={onRefreshAll}
          >
            {t`Refresh all`}
          </Button>
          <Button
            variant="default"
            leftSection={<Icon name="add" />}
            onClick={onAddBlock}
          >
            {t`New summary`}
          </Button>
          <Button
            variant="filled"
            leftSection={<Icon name="dashboard" />}
            loading={isSaving}
            disabled={canvas.blocks.length === 0}
            onClick={() =>
              dashboard ? handleSave(dashboard) : setIsCreatingDashboard(true)
            }
          >
            {dashboard ? t`Update dashboard` : t`Save as dashboard`}
          </Button>
        </Group>
      </Flex>
      <SourceStrip base={base} onShowData={onShowData} />
      <CreateDashboardModal
        opened={isCreatingDashboard}
        collectionId={dataQuestion.collectionId()}
        onClose={() => setIsCreatingDashboard(false)}
        onCreate={(newDashboard) => {
          setIsCreatingDashboard(false);
          void handleSave(newDashboard);
        }}
      />
    </Box>
  );
}

type SourceStripProps = {
  base: SummaryBase;
  onShowData: () => void;
};

/** What every summary shares: the data tab's filters and custom columns. */
function SourceStrip({ base, onShowData }: SourceStripProps) {
  const filterLabels = getSourceFilterLabels(base);
  const expressionLabels = getSourceExpressionLabels(base);
  const hasSharedChanges =
    filterLabels.length > 0 || expressionLabels.length > 0;

  return (
    <Flex
      className={S.sourceStrip}
      align="center"
      gap="xs"
      wrap="wrap"
      data-testid="summary-source-strip"
    >
      <Icon name="link" size={12} c="text-secondary" aria-hidden />
      <Text size="sm" c="text-secondary">
        {hasSharedChanges
          ? t`Applies to every summary:`
          : t`Filters and formula columns you add on the data tab apply to every summary.`}
      </Text>
      {filterLabels.map((label, index) => (
        <Badge
          key={`filter-${index}`}
          variant="light"
          color="core-filter"
          leftSection={<Icon name="filter" size={10} />}
        >
          {label}
        </Badge>
      ))}
      {expressionLabels.map((label, index) => (
        <Badge
          key={`expression-${index}`}
          variant="light"
          leftSection={<Icon name="function" size={10} />}
        >
          {label}
        </Badge>
      ))}
      <UnstyledButton onClick={onShowData}>
        <Text size="sm" c="text-brand">
          {t`Edit data`}
        </Text>
      </UnstyledButton>
    </Flex>
  );
}
