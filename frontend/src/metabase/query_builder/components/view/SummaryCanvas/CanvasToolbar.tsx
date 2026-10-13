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
  ) => void;
};

export function CanvasToolbar({
  dataQuestion,
  base,
  canvas,
  onAddBlock,
  onRefreshAll,
  onShowData,
  onSaved,
}: CanvasToolbarProps) {
  const dispatch = useDispatch();
  const [isCreatingDashboard, setIsCreatingDashboard] = useState(false);
  const { save, isSaving } = useSaveSummaryCanvas();
  const { dashboard } = canvas;

  const handleSave = async (targetDashboard: SummaryCanvasDashboard) => {
    try {
      const { cardIds, skippedCount } = await save({
        dashboard: targetDashboard,
        dataQuestion,
        base,
        blocks: canvas.blocks,
      });
      onSaved(targetDashboard, cardIds);
      dispatch(
        addUndo({
          message:
            skippedCount > 0
              ? t`Saved to ${targetDashboard.name}. Summaries with errors were left out.`
              : t`Saved to ${targetDashboard.name}`,
        }),
      );
    } catch {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`Couldn't save these summaries. Try again.`,
        }),
      );
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
          ? t`Every summary uses the data tab's`
          : t`Every summary uses the data tab. Filters you add there apply to all of them.`}
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
