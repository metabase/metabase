import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useMemo, useState } from "react";
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
import * as Lib from "metabase-lib";
import type { Card, TableId } from "metabase-types/api";

import type { SummaryExpression } from "../../components/view/SummarySidebar/types";
import { getSummaryBase } from "../../components/view/SummarySidebar/utils";
import { QuestionDataSource } from "../../components/view/ViewHeader/components/QuestionDataSource";
import { ViewHeading } from "../../components/view/ViewSection";

import { PrototypePicker } from "./PrototypePicker/PrototypePicker";
import { ResizableSummaryPanel } from "./ResizableSummaryPanel/ResizableSummaryPanel";
import { SeedControls } from "./SeedControls/SeedControls";
import S from "./SidebarPrototypePage.module.css";
import type { SeedFormula, SidebarPrototypeVariant } from "./types";
import { usePrototypeQuestion } from "./use-prototype-question";
import { useSourceCard } from "./use-source-card";

type SidebarPrototypeProps = {
  /** The route the prototype is mounted at, e.g. `/prototypes/summarize-sidebar`. */
  basePath: string;
  /** The variants, in picker order; the first is the default. */
  variants: readonly SidebarPrototypeVariant[];
  /**
   * Custom aggregations to offer above the workspace, by upper-cased source table name (`ORDERS`).
   * Omitted, the page has no seed controls.
   */
  seedFormulasByTable?: Readonly<Record<string, readonly SeedFormula[]>>;
};

function getSourceTableName(query: Lib.Query): string | null {
  const tableId = Lib.sourceTableOrCardId(query);
  const table =
    tableId != null ? Lib.tableOrCardMetadata(query, tableId) : null;
  return table != null ? Lib.displayInfo(query, -1, table).name : null;
}

function getPrototypeUrl(
  basePath: string,
  variantSlug: string,
  sourceId: TableId,
) {
  const search = new URLSearchParams({ source: String(sourceId) });
  return `${basePath}/${variantSlug}?${search}`;
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
 * A throwaway page for iterating on a summarize sidebar: a variant's sidebar and the results it
 * produces, nothing else from the query builder. `<basePath>/<variant>?source=<id>` names the
 * variant and the data, so any configuration can be shared as a link.
 */
export function SidebarPrototypePage(props: SidebarPrototypeProps) {
  const { basePath, variants } = props;
  const { variant: variantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const sourceId = parseSourceId(searchParams.get("source"));
  const variantIndex = variants.findIndex(
    (variant) => variant.slug === variantSlug,
  );

  if (sourceId == null) {
    return (
      <DefaultSourceRedirect
        basePath={basePath}
        variantSlug={
          variantIndex >= 0 ? variants[variantIndex].slug : variants[0].slug
        }
      />
    );
  }
  if (variantIndex < 0) {
    return (
      <Navigate
        replace
        to={getPrototypeUrl(basePath, variants[0].slug, sourceId)}
      />
    );
  }
  return (
    <PrototypeSource
      {...props}
      key={String(sourceId)}
      sourceId={sourceId}
      variantIndex={variantIndex}
    />
  );
}

function DefaultSourceRedirect({
  basePath,
  variantSlug,
}: {
  basePath: string;
  variantSlug: string;
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
      to={getPrototypeUrl(basePath, variantSlug, defaultTable.id)}
    />
  );
}

function PrototypeSource({
  sourceId,
  variantIndex,
  ...props
}: SidebarPrototypeProps & {
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
      {...props}
      sourceId={sourceId}
      sourceCard={sourceCardState.card}
      variantIndex={variantIndex}
    />
  );
}

function PrototypeWorkspace({
  basePath,
  variants,
  seedFormulasByTable,
  sourceId,
  sourceCard,
  variantIndex,
}: SidebarPrototypeProps & {
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
  const sourceBase = useMemo(
    () => getSummaryBase(sourceQuestion.query()),
    [sourceQuestion],
  );
  const sourceTableName = getSourceTableName(sourceQuestion.query());
  const seedFormulas =
    (sourceTableName != null
      ? seedFormulasByTable?.[sourceTableName.toUpperCase()]
      : undefined) ?? [];
  const [seededValues, setSeededValues] = useState<
    readonly SummaryExpression[] | null
  >(null);
  const variant = variants[variantIndex];
  const { Sidebar } = variant;
  const pickerItems = variants.map(({ slug, name }) => ({
    key: slug,
    label: name,
  }));

  // every variant starts from the raw source: a summary built in one doesn't carry into another
  const handleSelectVariant = (index: number) => {
    if (index === variantIndex) {
      return;
    }
    resetToSource();
    setSeededValues(null);
    navigate(getPrototypeUrl(basePath, variants[index].slug, sourceId), {
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
      {seedFormulasByTable != null && (
        <SeedControls
          base={sourceBase}
          formulas={seedFormulas}
          onSeed={setSeededValues}
        />
      )}
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
            seededValues={seededValues}
            onQuestionChange={(nextQuestion) =>
              updateQuestion(nextQuestion, { run: true })
            }
          />
        </ResizableSummaryPanel>
      </Box>
      <PrototypePicker
        items={pickerItems}
        activeIndex={variantIndex}
        onSelect={handleSelectVariant}
      />
      {isPickingSource && (
        <DataPickerModal
          title={t`Pick the data to summarize`}
          onChange={(nextSourceId) =>
            navigate(getPrototypeUrl(basePath, variant.slug, nextSourceId))
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
