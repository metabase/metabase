import { useCallback } from "react";
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
import { Box, Button, Flex, Icon, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

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

export const NotebookNativePreview = (): JSX.Element => {
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));

  const database = question.database();
  const engine = database?.engine;
  const engineType = getEngineNativeType(engine);

  const sourceQuery = question.query();
  const canRun = Lib.canRun(sourceQuery, question.type());
  const payload = Lib.toLegacyQuery(sourceQuery);
  const { data, error, isFetching } = useGetNativeDatasetQuery(payload);

  const showLoader = isFetching;
  const showError = !isFetching && canRun && !!error;
  const showQuery = !isFetching && canRun && !error;
  const showEmptySidebar = !canRun;

  const newQuestion = createNativeQuestion(question, data);
  const newQuery = newQuestion.query();

  const handleConvertClick = useCallback(() => {
    dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }));
    dispatch(setUIControls({ isNativeEditorOpen: true }));
  }, [newQuestion, dispatch]);

  const getErrorMessage = (error: unknown) =>
    typeof error === "string" ? error : undefined;

  const borderStyle = "1px solid var(--mb-color-border)";

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
        {showQuery && <Editor query={newQuery} readOnly />}
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
