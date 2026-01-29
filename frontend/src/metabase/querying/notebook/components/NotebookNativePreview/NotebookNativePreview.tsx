import { useCallback } from "react";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker/components/LoadingSpinner";
import { getEngineNativeType } from "metabase/lib/engine";
import { CodeMirrorEditor as Editor } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor";
import { Box, Button, Flex, Icon, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { createNativeQuestion } from "./utils";

const TITLE = {
  get sql() {
    return t`SQL for this question`;
  },
  get json() {
    return t`Native query for this question`;
  },
};

const BUTTON_TITLE = {
  get sql() {
    return t`Convert this question to SQL`;
  },
  get json() {
    return t`Convert this question to a native query`;
  },
};

type NotebookNativePreviewProps = {
  question: Question;
  title?: string;
  buttonTitle?: string;
  onConvertClick: (newQuestion: Question) => void;
  readOnly?: boolean;
};

export const NotebookNativePreview = ({
  question,
  title,
  buttonTitle,
  onConvertClick,
  readOnly,
}: NotebookNativePreviewProps) => {
  const database = question.database();
  const engine = database?.engine;
  const engineType = getEngineNativeType(engine);

  const sourceQuery = question.query();
  const canRun = Lib.canRun(sourceQuery, question.type());
  const payload = Lib.toJsQuery(sourceQuery);
  const { data, error, isFetching } = useGetNativeDatasetQuery(payload);

  const showLoader = isFetching;
  const showError = !isFetching && canRun && !!error;
  const showQuery = !isFetching && canRun && !error;
  const showEmptySidebar = !canRun;

  const newQuestion = createNativeQuestion(question, data);
  const newQuery = newQuestion?.query();

  const getErrorMessage = (error: unknown) =>
    typeof error === "string" ? error : undefined;

  const borderStyle = "1px solid var(--mb-color-border)";

  const handleConvertClick = useCallback(() => {
    if (newQuestion) {
      onConvertClick(newQuestion);
    }
  }, [newQuestion, onConvertClick]);

  return (
    <Box
      component="aside"
      data-testid="native-query-preview-sidebar"
      w="100%"
      h="100%"
      bg="background-primary"
      display="flex"
      style={{ flexDirection: "column" }}
    >
      <Box
        component="header"
        c="text-primary"
        fz={rem(20)}
        lh={rem(24)}
        fw="bold"
        ta="start"
        p="1.5rem"
      >
        {title ?? TITLE[engineType]}
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
            <Icon name="warning" size="2rem" c="error" />
            {t`Error generating the query.`}
            <Box mt="sm">{getErrorMessage(error)}</Box>
          </Flex>
        )}
        {showQuery && newQuery != null && <Editor query={newQuery} readOnly />}
      </Flex>
      {!readOnly && (
        <Box ta="end" p="1.5rem">
          <Button
            variant="subtle"
            p={0}
            onClick={handleConvertClick}
            disabled={!showQuery}
          >
            {buttonTitle ?? BUTTON_TITLE[engineType]}
          </Button>
        </Box>
      )}
    </Box>
  );
};
