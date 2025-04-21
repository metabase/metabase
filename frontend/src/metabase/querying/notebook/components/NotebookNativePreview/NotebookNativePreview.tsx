import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { CodeMirrorEditor as Editor } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor";
import { getQuestion } from "metabase/query_builder/selectors";
import { Box, Button, Flex, Icon, Tabs, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

import { createNativeQuestion } from "./utils";

const TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

const BUTTON_TITLE = {
  sql: t`Convert this question to SQL`,
  json: t`Convert this question to a native query`,
};

export const NotebookNativePreview = (): JSX.Element => {
  const [activeTab, setActiveTab] = useState("0");
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));

  const database = question.database();
  const engine = database?.engine;
  const engineType = getEngineNativeType(engine);

  const sourceQuery = question.query();
  const canRun = Lib.canRun(sourceQuery, question.type());

  // Get visualization settings from the question
  const visualizationSettings = question.settings();

  // Add visualization settings to the payload
  const payload = {
    ...Lib.toLegacyQuery(sourceQuery),
    viz_settings: visualizationSettings,
  };

  const { data, error, isFetching } = useGetNativeDatasetQuery(payload);

  const isPivotResponse = !!data?.is_pivot;
  const pivotQueries = data?.all_queries;

  const showLoader = isFetching;
  const showError = !isFetching && canRun && !!error;
  const showQuery = !isFetching && canRun && !error;
  const showEmptySidebar = !canRun;

  // For regular queries
  const newQuestion = createNativeQuestion(question, data);
  const newQuery = newQuestion.query();

  // For pivot queries, create a question for each query in the response
  // Wrap in useMemo to avoid recreating on every render
  const pivotQueryObjects = useMemo(() => {
    if (!isPivotResponse || !pivotQueries) {
      return [];
    }

    return pivotQueries.map((q) => {
      // Create a modified data object for each query
      const queryData = {
        query: q.query,
        params: q.params,
      };

      // Create a question object for this specific query
      const questionForQuery = createNativeQuestion(question, queryData);
      return {
        label: q.label || "Query",
        queryObject: questionForQuery.query(),
      };
    });
  }, [isPivotResponse, pivotQueries, question]);

  const handleConvertClick = useCallback(() => {
    // For pivot queries, use the currently selected tab's query
    if (isPivotResponse && pivotQueryObjects.length > 0) {
      const activeTabIndex = parseInt(activeTab, 10);
      const selectedQuery = pivotQueryObjects[activeTabIndex]?.queryObject;
      if (selectedQuery) {
        const questionToConvert = question.setQuery(selectedQuery);
        dispatch(
          updateQuestion(questionToConvert, {
            shouldUpdateUrl: true,
            run: true,
          }),
        );
        dispatch(setUIControls({ isNativeEditorOpen: true }));
        return;
      }
    }

    // Default behavior for regular queries
    dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }));
    dispatch(setUIControls({ isNativeEditorOpen: true }));
  }, [
    newQuestion,
    isPivotResponse,
    pivotQueryObjects,
    activeTab,
    question,
    dispatch,
  ]);

  const getErrorMessage = (error: unknown) =>
    typeof error === "string" ? error : undefined;

  const borderStyle = "1px solid var(--mb-color-border)";

  const renderQueryContent = () => {
    if (isPivotResponse && pivotQueryObjects.length > 0) {
      return (
        <Box style={{ height: "100%", overflow: "auto" }}>
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            style={{ height: "100%" }}
          >
            <Tabs.List>
              {pivotQueryObjects.map((q, idx) => (
                <Tabs.Tab key={idx} value={String(idx)}>
                  {q.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {pivotQueryObjects.map((q, idx) => (
              <Tabs.Panel
                key={idx}
                value={String(idx)}
                style={{ height: "calc(100% - 42px)" }}
              >
                <Box p="md" style={{ height: "100%" }}>
                  <Editor query={q.queryObject} readOnly />
                </Box>
              </Tabs.Panel>
            ))}
          </Tabs>
        </Box>
      );
    }

    return newQuery ? <Editor query={newQuery} readOnly /> : null;
  };

  return (
    <Box
      component="aside"
      data-testid="native-query-preview-sidebar"
      w="100%"
      h="100%"
      bg="bg-white"
      display="flex"
      style={{ flexDirection: "column" }}
    >
      <Box
        component="header"
        c={color("text-dark")}
        fz={rem(20)}
        lh={rem(24)}
        fw="bold"
        ta="start"
        p="1.5rem"
      >
        {TITLE[engineType]}
      </Box>
      <Flex
        style={{
          flex: 1,
          borderTop: borderStyle,
          borderBottom: borderStyle,
          overflow: "auto",
        }}
        direction="column"
      >
        {showLoader && <DelayedLoadingSpinner delay={1000} />}
        {showEmptySidebar}
        {showError && (
          <Flex align="center" justify="center" h="100%" direction="column">
            <Icon name="warning" size="2rem" color={color("error")} />
            {t`Error generating the query.`}
            <Box mt="sm">{getErrorMessage(error)}</Box>
          </Flex>
        )}
        {showQuery && renderQueryContent()}
      </Flex>
      <Box ta="end" p="1.5rem">
        <Button
          variant="subtle"
          p={0}
          onClick={handleConvertClick}
          disabled={!showQuery}
        >
          {BUTTON_TITLE[engineType]}
        </Button>
      </Box>
    </Box>
  );
};
