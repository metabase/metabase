import cx from "classnames";
import { useCallback } from "react";
import AceEditor from "react-ace";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { updateQuestion, setUIControls } from "metabase/query_builder/actions";
import { NativeQueryEditorRoot } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { getQuestion } from "metabase/query_builder/selectors";
import { Box, Button, Flex, Icon, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

import SB from "./NativeQueryPreviewSidebar.module.css";
import { createDatasetQuery } from "./utils";

const TITLE = {
  sql: t`SQL for this question`,
  json: t`Native query for this question`,
};

const BUTTON_TITLE = {
  sql: t`Convert this question to SQL`,
  json: t`Convert this question to a native query`,
};

export const NativeQueryPreviewSidebar = (): JSX.Element => {
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));

  const engineType = getEngineNativeType(question.database()?.engine);

  const payload = Lib.toLegacyQuery(question.query());
  const { data, error, isLoading } = useGetNativeDatasetQuery(payload);
  const query = data?.query;

  const handleConvertClick = useCallback(() => {
    if (!query) {
      return;
    }

    const newDatasetQuery = createDatasetQuery(query, question);
    const newQuestion = question.setDatasetQuery(newDatasetQuery);

    dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }));
    dispatch(setUIControls({ isNativeEditorOpen: true }));
  }, [question, query, dispatch]);

  const getErrorMessage = (error: unknown) =>
    typeof error === "string" ? error : undefined;

  const borderStyle = `1px solid ${color("border")}`;
  const aceMode = getEngineNativeType(engineType);

  return (
    <Flex
      className={cx(SB.container)}
      role="complementary"
      direction="column"
      style={{ borderLeft: borderStyle }}
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
      <Box
        style={{ flex: 1, borderTop: borderStyle, borderBottom: borderStyle }}
      >
        {isLoading && <DelayedLoadingSpinner delay={1000} />}
        {error && (
          <Flex align="center" justify="center" h="100%" direction="column">
            <Icon name="warning" size="2rem" color={color("error")} />
            {t`Error generating the query.`}
            <Box mt="sm">{getErrorMessage(error)}</Box>
          </Flex>
        )}
        {!error && query && (
          <NativeQueryEditorRoot style={{ height: "100%", flex: 1 }}>
            <AceEditor
              value={query}
              mode={aceMode}
              readOnly
              height="100%"
              highlightActiveLine={false}
              navigateToFileEnd={false}
              width="100%"
              fontSize={12}
              style={{ backgroundColor: color("bg-light") }}
              showPrintMargin={false}
              wrapEnabled={true}
            />
          </NativeQueryEditorRoot>
        )}
      </Box>
      <Box ta="end" p="1.5rem">
        {query && (
          <Button variant="subtle" p={0} onClick={handleConvertClick}>
            {BUTTON_TITLE[engineType]}
          </Button>
        )}
      </Box>
    </Flex>
  );
};
