import { useMemo, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { ActionIcon, Flex, Icon, Tooltip } from "metabase/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import {
  extractRemappings,
  getComputedSettingsForSeries,
  getSensibleVisualizations,
  getVisualizationTransformed,
  visualizations,
} from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, VisualizationDisplay } from "metabase-types/api";

import { useQuestionVisualizationState } from "../../chart-type-selector";

import S from "./TableFlow.module.css";

type VisualizationPickerProps = {
  question: Question;
  /** The question's results; picks which visualizations are suggested. */
  result: Dataset | null;
  onQuestionChange: (question: Question) => void;
  onOpenSettings: () => void;
};

/**
 * A round button showing the current visualization. It slides out the suggested
 * visualizations for the question's results, followed by a button for all settings.
 */
export function VisualizationPicker({
  question,
  result,
  onQuestionChange,
  onOpenSettings,
}: VisualizationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualizationState({
      question,
      onUpdateQuestion: onQuestionChange,
    });
  const suggestedVisualizations = useMemo(
    () => getSensibleVisualizations({ result }).sensibleVisualizations,
    [result],
  );
  const currentVisualization = visualizations.get(selectedVisualization);

  return (
    <Flex align="center" gap="xs" data-testid="visualization-picker">
      <Tooltip label={t`Change visualization`}>
        <ActionIcon
          className={S.vizToggle}
          radius="xl"
          variant={isOpen ? "filled" : "default"}
          aria-label={t`Change visualization`}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
        >
          <Icon name={currentVisualization?.iconName ?? "unknown"} />
        </ActionIcon>
      </Tooltip>
      <Flex
        className={S.vizBar}
        data-open={isOpen}
        align="center"
        gap="xxs"
        aria-hidden={!isOpen}
      >
        {suggestedVisualizations.map((display) => (
          <VisualizationOption
            key={display}
            display={display}
            isSelected={display === selectedVisualization}
            isTabbable={isOpen}
            onSelect={updateQuestionVisualization}
          />
        ))}
        <Tooltip label={t`More options`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`More options`}
            tabIndex={isOpen ? 0 : -1}
            onClick={onOpenSettings}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Flex>
  );
}

type VisualizationOptionProps = {
  display: VisualizationDisplay;
  isSelected: boolean;
  isTabbable: boolean;
  onSelect: (display: VisualizationDisplay) => void;
};

function VisualizationOption({
  display,
  isSelected,
  isTabbable,
  onSelect,
}: VisualizationOptionProps) {
  const visualization = visualizations.get(display);
  const name = visualization?.getUiName() ?? display;

  return (
    <Tooltip label={name}>
      <ActionIcon
        variant={isSelected ? "light" : "subtle"}
        aria-label={name}
        aria-pressed={isSelected}
        tabIndex={isTabbable ? 0 : -1}
        onClick={() => onSelect(display)}
      >
        <Icon name={visualization?.iconName ?? "unknown"} />
      </ActionIcon>
    </Tooltip>
  );
}

type VisualizationSettingsPanelProps = {
  question: Question;
  result: Dataset | null;
  onQuestionChange: (question: Question) => void;
  onClose: () => void;
};

/** The query builder's visualization settings, bound to `question` instead of the page's question. */
export function VisualizationSettingsPanel({
  question,
  result,
  onQuestionChange,
  onClose,
}: VisualizationSettingsPanelProps) {
  const card = question.card();
  const series = useMemo(
    () => (result ? [{ ...result, card }] : null),
    [card, result],
  );
  const computedSettings = useMemo(
    () =>
      series
        ? getComputedSettingsForSeries(
            getVisualizationTransformed(extractRemappings(series)).series,
          )
        : undefined,
    [series],
  );

  return (
    <SidebarContent
      title={t`${visualizations.get(question.display())?.getUiName()} options`}
      onDone={onClose}
      data-testid="visualization-settings-panel"
    >
      {series && (
        <ErrorBoundary>
          <QuestionChartSettings
            question={question}
            series={series}
            computedSettings={computedSettings}
            onChange={(settings, nextQuestion) =>
              onQuestionChange((nextQuestion ?? question).setSettings(settings))
            }
          />
        </ErrorBoundary>
      )}
    </SidebarContent>
  );
}
