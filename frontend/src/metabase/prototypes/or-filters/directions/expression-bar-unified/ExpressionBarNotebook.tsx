import { type ComponentType, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { NotebookProvider } from "metabase/querying/notebook/components/Notebook/context";
import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { NotebookStep } from "metabase/querying/notebook/components/NotebookStep";
import { NotebookActionButton } from "metabase/querying/notebook/components/NotebookStep/NotebookActionButton";
import { NotebookStepHeader } from "metabase/querying/notebook/components/NotebookStep/NotebookStepHeader";
import { NotebookStepPreview } from "metabase/querying/notebook/components/NotebookStep/NotebookStepPreview";
import { getStepConfig } from "metabase/querying/notebook/components/NotebookStep/utils";
import type {
  NotebookStep as INotebookStep,
  OpenSteps,
} from "metabase/querying/notebook/types";
import { getQuestionSteps } from "metabase/querying/notebook/utils/steps";
import { useSetting } from "metabase/settings";
import { Box, Button, Flex, Paper, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import { QueryResults } from "../../harness/QueryResults";
import type { FilterCanvasProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";

const RESULTS_STAGE_INDEX = 0;

type FilterBarProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

type ExpressionBarNotebookProps = FilterCanvasProps & {
  /** Replaces the default expression bar in every Filter step. */
  FilterBar?: ComponentType<FilterBarProps>;
  /** Replaces the Summarize step's cells, which it draws itself. */
  SummarizeBar?: ComponentType<FilterBarProps>;
  /** Edits stay in the notebook until Visualize hands them to the page. */
  appliesOnVisualize?: boolean;
};

function DefaultFilterBar(props: FilterBarProps) {
  return <ExpressionBar {...props} actionsPlacement="inline" />;
}

/**
 * The full notebook (Data, Filter, Summarize, a Filter on the summary, Sort,
 * Row limit, Visualize) built from the real notebook steps, except that every
 * Filter step is the expression bar for its own stage. Stages are already
 * separate steps here, so each bar edits one stage and needs no inline
 * summary segment.
 */
export function ExpressionBarNotebook({
  query,
  onChange,
  FilterBar = DefaultFilterBar,
  SummarizeBar,
  appliesOnVisualize = false,
}: ExpressionBarNotebookProps) {
  const [draftQuery, setDraftQuery] = useState(query);
  useEffect(() => setDraftQuery(query), [query]);
  const notebookQuery = appliesOnVisualize ? draftQuery : query;
  const changeNotebookQuery = appliesOnVisualize ? setDraftQuery : onChange;

  const buildQuestion = useQuestionFromOptsBuilder();
  const reportTimezone = useSetting("report-timezone-long");
  const [openSteps, setOpenSteps] = useState<OpenSteps>({});
  const [display, setDisplay] = useState<CardDisplayType>("table");
  const [isVisualized, setIsVisualized] = useState(false);

  const question = useMemo(
    () => buildQuestion({ dataset_query: Lib.toJsQuery(notebookQuery) }),
    [buildQuestion, notebookQuery],
  );
  const steps = useMemo(() => {
    const database = question.database();
    return database ? getQuestionSteps(question, database, openSteps) : [];
  }, [question, openSteps]);

  const openStep = (id: INotebookStep["id"]) =>
    setOpenSteps((current) => ({ ...current, [id]: true }));

  const handleStepChange = async (
    nextQuery: Lib.Query,
    step: INotebookStep,
  ) => {
    changeNotebookQuery(Lib.dropEmptyStages(nextQuery));
    setOpenSteps((current) => ({ ...current, [step.id]: false }));
  };

  return (
    <NotebookProvider>
      <Paper withBorder radius="md" p="xl">
        {steps.map((step, index) => {
          const stepProps = {
            step,
            isLastStep: index === steps.length - 1,
            isLastOpened: false,
            reportTimezone,
            openStep,
            updateQuery: (nextQuery: Lib.Query) =>
              handleStepChange(nextQuery, step),
          };
          if (step.type === "filter") {
            return (
              <ExpressionFilterStep
                key={step.id}
                {...stepProps}
                FilterBar={FilterBar}
              />
            );
          }
          if (step.type === "summarize" && SummarizeBar) {
            return (
              <ExpressionFilterStep
                key={step.id}
                {...stepProps}
                FilterBar={SummarizeBar}
                hasOwnCell
              />
            );
          }
          return <NotebookStep key={step.id} {...stepProps} />;
        })}
        <Stack gap="xl" align="flex-start">
          <Button
            variant="filled"
            size="lg"
            miw={220}
            onClick={() => {
              if (appliesOnVisualize) {
                onChange(draftQuery);
              }
              setIsVisualized(true);
            }}
          >
            {t`Visualize`}
          </Button>
          {isVisualized && (
            <Box w="100%">
              <QueryResults
                query={notebookQuery}
                stageIndex={RESULTS_STAGE_INDEX}
                display={display}
                onChange={(nextQuery, nextDisplay) => {
                  changeNotebookQuery(nextQuery);
                  setDisplay(nextDisplay);
                }}
              />
            </Box>
          )}
        </Stack>
      </Paper>
    </NotebookProvider>
  );
}

type ExpressionFilterStepProps = {
  step: INotebookStep;
  isLastStep: boolean;
  openStep: (id: string) => void;
  updateQuery: (query: Lib.Query) => Promise<void>;
  FilterBar: ComponentType<FilterBarProps>;
  hasOwnCell?: boolean;
};

/**
 * The real notebook step's frame (header, preview, action buttons) around the
 * expression bar instead of the filter pills.
 */
function ExpressionFilterStep({
  step,
  isLastStep,
  openStep,
  updateQuery,
  FilterBar,
  hasOwnCell = false,
}: ExpressionFilterStepProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { title, color } = getStepConfig(step.type);
  const hasLargeActionButtons =
    isLastStep &&
    step.actions.some((action) => !getStepConfig(action.type).compact);
  const actions = [...step.actions].sort(
    (a, b) =>
      (getStepConfig(b.type).priority ?? 0) -
      (getStepConfig(a.type).priority ?? 0),
  );
  const canPreview = step.previewQuery != null;
  const bar = (
    <FilterBar
      query={step.query}
      stageIndex={step.stageIndex}
      onChange={updateQuery}
    />
  );

  return (
    <Box mb="md" pb="md" data-testid={step.testID}>
      <Box w={`${(11 / 12) * 100}%`} maw="75rem">
        <NotebookStepHeader
          step={step}
          title={title}
          color={color}
          canRevert={false}
        />
      </Box>
      <Flex align="center">
        <Box flex={`1 1 ${(11 / 12) * 100}%`} maw="75rem">
          {hasOwnCell ? bar : <NotebookCell color={color}>{bar}</NotebookCell>}
        </Box>
        <Box flex={`1 1 ${(1 / 12) * 100}%`} ml="sm">
          {canPreview && !isPreviewOpen && (
            <NotebookActionButton
              icon="play"
              title={t`Preview`}
              color="text-disabled"
              onClick={() => setIsPreviewOpen(true)}
            />
          )}
        </Box>
      </Flex>
      {canPreview && isPreviewOpen && (
        <NotebookStepPreview
          step={step}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
      {actions.length > 0 && (
        <Flex mt="sm" gap="sm" wrap="wrap">
          {actions.map((action) => {
            const stepUi = getStepConfig(action.type);
            return (
              <NotebookActionButton
                key={action.type}
                large={hasLargeActionButtons}
                icon={stepUi.icon}
                color={stepUi.color}
                secondary={stepUi.secondary}
                title={stepUi.title}
                aria-label={stepUi.title}
                onClick={() => action.action({ openStep })}
              />
            );
          })}
        </Flex>
      )}
    </Box>
  );
}
