import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { useListTablesQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { useQuestionFromCard } from "metabase/metadata-store";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "metabase/router";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import type { Card, TableId } from "metabase-types/api";

import { QuestionDataSource } from "../../components/view/ViewHeader/components/QuestionDataSource";
import { ViewHeading } from "../../components/view/ViewSection";

import { PrototypePicker } from "./PrototypePicker/PrototypePicker";
import { ResizableSummaryPanel } from "./ResizableSummaryPanel/ResizableSummaryPanel";
import S from "./SummarizeSidebarPrototypePage.module.css";
import { usePrototypeQuestion } from "./use-prototype-question";
import { useSourceCard } from "./use-source-card";
import { VARIANTS } from "./variants";

const PROTOTYPE_PATH = "/prototypes/summarize-sidebar";

const PICKER_ITEMS = VARIANTS.map((variant) => ({
  key: variant.slug,
  label: variant.name,
}));

function getPrototypeUrl(variantSlug: string, sourceId: TableId) {
  const search = new URLSearchParams({ source: String(sourceId) });
  return `${PROTOTYPE_PATH}/${variantSlug}?${search}`;
}

/** `?source=` holds a table id (`12`) or a saved question's virtual table id (`card__34`). */
function parseSourceId(value: string | null): TableId | null {
  if (value == null) {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return /^card__\d+$/.test(value) ? value : null;
}

/**
 * A throwaway page for iterating on the summarize sidebar: a variant's sidebar and the results it
 * produces, nothing else from the query builder. `/prototypes/summarize-sidebar/<variant>?source=<id>`
 * names the variant and the data, so any configuration can be shared as a link.
 */
export function SummarizeSidebarPrototypePage() {
  const { variant: variantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const sourceId = parseSourceId(searchParams.get("source"));
  const variantIndex = VARIANTS.findIndex(
    (variant) => variant.slug === variantSlug,
  );

  if (sourceId == null) {
    return (
      <DefaultSourceRedirect
        variantSlug={variantIndex >= 0 ? VARIANTS[variantIndex].slug : null}
      />
    );
  }
  if (variantIndex < 0) {
    return (
      <Navigate replace to={getPrototypeUrl(VARIANTS[0].slug, sourceId)} />
    );
  }
  return (
    <PrototypeSource
      key={String(sourceId)}
      sourceId={sourceId}
      variantIndex={variantIndex}
    />
  );
}

function DefaultSourceRedirect({
  variantSlug,
}: {
  variantSlug: string | null;
}) {
  const { data: tables, error, isLoading } = useListTablesQuery();

  if (isLoading) {
    return (
      <CenteredState>
        <Loader />
      </CenteredState>
    );
  }
  const defaultTable =
    tables?.find((table) => table.db?.is_sample && table.name === "ORDERS") ??
    tables?.[0];
  if (defaultTable == null) {
    return (
      <CenteredState>
        {error != null
          ? getErrorMessage(error)
          : t`Add a database to summarize its data.`}
      </CenteredState>
    );
  }
  return (
    <Navigate
      replace
      to={getPrototypeUrl(variantSlug ?? VARIANTS[0].slug, defaultTable.id)}
    />
  );
}

function PrototypeSource({
  sourceId,
  variantIndex,
}: {
  sourceId: TableId;
  variantIndex: number;
}) {
  const sourceCardState = useSourceCard(sourceId);

  if (sourceCardState.status === "loading") {
    return (
      <CenteredState>
        <Loader />
      </CenteredState>
    );
  }
  if (sourceCardState.status === "error") {
    return <CenteredState>{sourceCardState.message}</CenteredState>;
  }
  return (
    <PrototypeWorkspace
      sourceId={sourceId}
      sourceCard={sourceCardState.card}
      variantIndex={variantIndex}
    />
  );
}

function PrototypeWorkspace({
  sourceId,
  sourceCard,
  variantIndex,
}: {
  sourceId: TableId;
  sourceCard: Card;
  variantIndex: number;
}) {
  const navigate = useNavigate();
  const [isPickingSource, setIsPickingSource] = useState(false);
  const { ref: contentRef, width: contentWidth } = useElementSize();
  const {
    question,
    result,
    rawSeries,
    error,
    isRunning,
    isRunnable,
    isResultDirty,
    updateQuestion,
    updateVisualizationSettings,
    rerun,
    cancelQuery,
    resetToSource,
  } = usePrototypeQuestion(sourceCard);
  const sourceQuestion = useQuestionFromCard(sourceCard);
  const variant = VARIANTS[variantIndex];
  const { Sidebar } = variant;

  // every variant starts from the raw source: a summary built in one doesn't carry into another
  const handleSelectVariant = (index: number) => {
    if (index === variantIndex) {
      return;
    }
    resetToSource();
    navigate(getPrototypeUrl(VARIANTS[index].slug, sourceId), {
      replace: true,
    });
  };

  return (
    <Box className={S.root}>
      <Flex className={S.toolbar} align="center" gap="md">
        {/* the heading the query builder gives an unsummarized question over this source */}
        <ViewHeading c="text-secondary">
          <QuestionDataSource question={sourceQuestion} />
        </ViewHeading>
        <Button
          ml="auto"
          flex="0 0 auto"
          leftSection={<Icon name="table" />}
          onClick={() => setIsPickingSource(true)}
        >
          {t`Change data`}
        </Button>
      </Flex>
      <Box ref={contentRef} className={S.content}>
        <Box component="main" className={S.main}>
          <DebouncedFrame className={S.frame} resetKey={isRunning}>
            {error != null ? (
              <CenteredState>{getErrorMessage(error)}</CenteredState>
            ) : (
              <QueryVisualization
                question={question}
                result={result}
                rawSeries={rawSeries}
                queryBuilderMode="view"
                isRunnable={isRunnable}
                isRunning={isRunning}
                isResultDirty={isResultDirty}
                isDirty
                isShowingSummarySidebar
                hasColumnReordering
                noHeader
                runQuestionQuery={rerun}
                cancelQuery={cancelQuery}
                onUpdateQuestion={updateQuestion}
                onUpdateVisualizationSettings={updateVisualizationSettings}
              />
            )}
          </DebouncedFrame>
        </Box>
        <ResizableSummaryPanel containerWidth={contentWidth}>
          <Sidebar
            key={variant.slug}
            question={question}
            onQuestionChange={(nextQuestion) =>
              updateQuestion(nextQuestion, { run: true })
            }
          />
        </ResizableSummaryPanel>
      </Box>
      <PrototypePicker
        items={PICKER_ITEMS}
        activeIndex={variantIndex}
        onSelect={handleSelectVariant}
      />
      {isPickingSource && (
        <DataPickerModal
          title={t`Pick the data to summarize`}
          onChange={(nextSourceId) =>
            navigate(getPrototypeUrl(variant.slug, nextSourceId))
          }
          onClose={() => setIsPickingSource(false)}
        />
      )}
    </Box>
  );
}

function CenteredState({ children }: { children: ReactNode }) {
  return (
    <Flex className={S.state} align="center" justify="center">
      {children}
    </Flex>
  );
}
