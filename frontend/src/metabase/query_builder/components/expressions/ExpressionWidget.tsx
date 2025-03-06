import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { Box, Button, Flex, Modal, Stack, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions/types";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../analytics";

import { CombineColumns, hasCombinations } from "./CombineColumns";
import { Editor } from "./Editor";
import type { Shortcut } from "./Editor/Shortcuts";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import { ExtractColumn, hasExtractions } from "./ExtractColumn";
import { NameInput } from "./NameInput";
import type { ClauseType, StartRule } from "./types";
import { useClickOutsideModal } from "./utils";

const WIDGET_WIDTH = 472;
const EDITOR_WIDGET_WIDTH = 688;

export type ExpressionWidgetProps<S extends StartRule = "expression"> = {
  startRule?: S;

  query: Lib.Query;
  stageIndex: number;
  clause?: ClauseType<S> | undefined;
  name?: string;
  withName?: boolean;
  reportTimezone?: string;
  header?: ReactNode;
  expressionIndex?: number;

  onChangeClause?: (name: string, clause: ClauseType<S>) => void;
  onClose?: () => void;
};

export const ExpressionWidget = <S extends StartRule = "expression">(
  props: ExpressionWidgetProps<S>,
) => {
  type Clause = ClauseType<S>;

  const {
    query,
    stageIndex,
    name: initialName,
    clause: initialClause,
    withName = false,
    startRule = "expression",
    reportTimezone,
    header,
    expressionIndex,
    onChangeClause,
    onClose,
  } = props;

  const [name, setName] = useState(initialName || "");
  const [clause, setClause] = useState<Clause | null>(initialClause ?? null);
  const [error, setError] = useState<ErrorWithMessage | null>(null);

  const [isCombiningColumns, setIsCombiningColumns] = useState(false);
  const [isExtractingColumn, setIsExtractingColumn] = useState(false);

  const isValidName = withName ? name.trim().length > 0 : true;
  const isValidExpressionClause = isNotNull(clause);
  const isValid = !error && isValidName && isValidExpressionClause;

  const handleCommit = useCallback(
    (clause: Clause | null) => {
      const isValidExpressionClause = isNotNull(clause);
      const isValid = !error && isValidName && isValidExpressionClause;

      if (!isValid) {
        return;
      }

      onChangeClause?.(name, clause);
      onClose?.();
    },
    [name, isValidName, error, onChangeClause, onClose],
  );

  const handleSubmit = useCallback(() => {
    handleCommit(clause);
  }, [clause, handleCommit]);

  const handleExpressionChange = useCallback(
    (clause: Clause | null, error: ErrorWithMessage | null = null) => {
      if (error) {
        setError(error);
        return;
      } else {
        setClause(clause);
        setError(null);
      }
    },
    [],
  );

  const shortcuts = useMemo(
    () =>
      [
        startRule === "expression" &&
          hasCombinations(query, stageIndex) && {
            name: t`Combine columns`,
            icon: "combine",
            action: () => setIsCombiningColumns(true),
          },
        startRule === "expression" &&
          hasExtractions(query, stageIndex) && {
            name: t`Extract columns`,
            icon: "arrow_split",
            action: () => setIsExtractingColumn(true),
          },
      ].filter((x): x is Shortcut => Boolean(x)),
    [startRule, query, stageIndex],
  );

  const handleCombineColumnsSubmit = useCallback(
    (name: string, clause: Lib.ExpressionClause) => {
      trackColumnCombineViaShortcut(query);
      handleExpressionChange(clause as Clause);
      setName(name);
      setIsCombiningColumns(false);
    },
    [query, handleExpressionChange],
  );

  const handleExtractColumnSubmit = useCallback(
    (
      clause: Lib.ExpressionClause,
      name: string,
      extraction: Lib.ColumnExtraction,
    ) => {
      trackColumnExtractViaShortcut(query, stageIndex, extraction);
      handleExpressionChange(clause as Clause);
      setName(name);
      setIsExtractingColumn(false);
    },
    [query, stageIndex, handleExpressionChange],
  );

  const handleCancel = useCallback(() => {
    setIsCombiningColumns(false);
    setIsExtractingColumn(false);
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const { showModal, closeModal } = useClickOutsideModal(ref);

  if (startRule === "expression" && isCombiningColumns) {
    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <ExpressionWidgetHeader
          title={t`Select columns to combine`}
          onBack={handleCancel}
        />
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          onSubmit={handleCombineColumnsSubmit}
        />
      </Box>
    );
  }

  if (isExtractingColumn) {
    return (
      <Box w={WIDGET_WIDTH} data-testid="expression-editor">
        <ExtractColumn
          query={query}
          stageIndex={stageIndex}
          onCancel={handleCancel}
          onSubmit={handleExtractColumnSubmit}
        />
      </Box>
    );
  }

  return (
    <Box w={EDITOR_WIDGET_WIDTH} data-testid="expression-editor" ref={ref}>
      {header}

      <Modal
        title={t`Keep editing your custom expression?`}
        opened={showModal}
        onClose={closeModal}
        closeOnEscape
        closeButtonProps={{ style: { display: "none" } }}
        data-ignore-editor-clicks="true"
      >
        <Stack gap="md">
          <Box py="md">
            <Text>
              {t`You have changes that haven't been saved to your custom expression. You can continue editing it or discard the changes.`}
            </Text>
          </Box>

          <Flex justify="end" gap="sm">
            <Button onClick={onClose} variant="subtle">
              {t`Discard changes`}
            </Button>
            <Button onClick={closeModal} variant="primary">
              {t`Keep editing`}
            </Button>
          </Flex>
        </Stack>
      </Modal>

      <Editor
        id="expression-content"
        startRule={startRule as S}
        clause={clause}
        onChange={handleExpressionChange}
        name={name}
        query={query}
        stageIndex={stageIndex}
        expressionIndex={expressionIndex}
        reportTimezone={reportTimezone}
        shortcuts={shortcuts}
        error={error}
      />

      <Flex gap="xs" align="center" justify="end" p="0" pr="sm">
        {withName && (
          <NameInput
            value={name}
            onChange={setName}
            onSubmit={handleSubmit}
            startRule={startRule}
          />
        )}

        <Flex py="sm" pr="sm" gap="sm">
          {onClose && (
            <Button
              onClick={onClose}
              variant="subtle"
              size="xs"
            >{t`Cancel`}</Button>
          )}
          <Button
            variant="filled"
            disabled={!isValid}
            onClick={handleSubmit}
            size="xs"
          >
            {initialName || initialClause ? t`Update` : t`Done`}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
