import { useCallback, useState } from "react";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker/components/LoadingSpinner";
import { useToast } from "metabase/common/hooks/use-toast/use-toast";
import { color } from "metabase/lib/colors";
import { getEngineNativeType } from "metabase/lib/engine";
import { CodeMirrorEditor as Editor } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor";
import { Box, Button, Flex, Icon, Tooltip, rem } from "metabase/ui";
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

const useCopyButton = (value: string, sendToast: any) => {
  const [isCopied, setIsCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopy = useCallback(async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      sendToast({
        message: t`SQL copied to clipboard`,
        icon: "check",
        timeout: 3000,
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      sendToast({
        message: t`Failed to copy SQL to clipboard. Your browser may not support this feature.`,
        icon: "warning",
        timeout: 5000,
      });
    } finally {
      setCopying(false);
    }
  }, [value, sendToast]);

  return { isCopied, copying, handleCopy };
};

const BUTTON_TITLE = {
  get sql() {
    return t`Convert this question to SQL`;
  },
  get json() {
    return t`Convert this question to a native query`;
  },
};

export const NotebookNativePreview = ({
  question,
  onConvertClick,
  buttonTitle,
}: {
  question: Question;
  onConvertClick: (newQuestion: Question) => void;
  buttonTitle?: string;
}) => {
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

  // Get the SQL text for copying
  const sqlText = data?.query || "";
  const [sendToast] = useToast();
  const { isCopied, copying, handleCopy } = useCopyButton(sqlText, sendToast);

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
      bg="bg-white"
      display="flex"
      style={{ flexDirection: "column" }}
    >
      <Flex
        component="header"
        align="center"
        justify="space-between"
        c={color("text-dark")}
        fz={rem(20)}
        lh={rem(24)}
        fw="bold"
        p="1.5rem"
      >
        <Box>{TITLE[engineType]}</Box>
        {showQuery && sqlText && (
          <Tooltip
            label={
              isCopied
                ? t`Copied!`
                : copying
                  ? t`Copying…`
                  : t`Copy to clipboard`
            }
            opened={isCopied}
          >
            <Button
              variant="subtle"
              size="sm"
              p={0}
              onClick={handleCopy}
              disabled={copying}
              leftSection={
                <Icon name={copying ? "hourglass" : "copy"} size="1rem" />
              }
              aria-label={
                isCopied
                  ? t`Copied!`
                  : copying
                    ? t`Copying…`
                    : t`Copy to clipboard`
              }
            >
              {isCopied
                ? t`Copied!`
                : copying
                  ? t`Copying…`
                  : t`Copy to clipboard`}
            </Button>
          </Tooltip>
        )}
      </Flex>
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
        {showQuery && newQuery != null && <Editor query={newQuery} readOnly />}
      </Flex>
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
    </Box>
  );
};
