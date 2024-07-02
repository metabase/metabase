import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input/Input";
import { isNotNull } from "metabase/lib/types";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import { isExpression } from "metabase-lib/v1/expressions";
import type { Expression } from "metabase-types/api";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../analytics";

import { CombineColumns, hasCombinations } from "./CombineColumns";
import { ExpressionEditorTextfield } from "./ExpressionEditorTextfield";
import {
  ActionButtonsWrapper,
  Container,
  ExpressionFieldWrapper,
  FieldLabel,
  FieldWrapper,
  Footer,
  RemoveLink,
} from "./ExpressionWidget.styled";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import { ExpressionWidgetInfo } from "./ExpressionWidgetInfo";
import { ExtractColumn, hasExtractions } from "./ExtractColumn";

export type ExpressionWidgetProps<Clause = Lib.ExpressionClause> = {
  query: Lib.Query;
  stageIndex: number;
  /**
   * expression should not be present in components migrated to MLv2
   */
  expression?: Expression | undefined;
  /**
   * Presence of this prop is not enforced due to backwards-compatibility
   * with ExpressionWidget usages outside of GUI editor.
   */
  clause?: Clause | undefined;
  name?: string;
  withName?: boolean;
  startRule?: string;
  reportTimezone?: string;
  header?: ReactNode;
  expressionIndex?: number;

  onChangeExpression?: (name: string, expression: Expression) => void;
  onChangeClause?: (
    name: string,
    clause: Clause | Lib.ExpressionClause,
  ) => void;
  onRemoveExpression?: (name: string) => void;
  onClose?: () => void;
};

export const ExpressionWidget = <Clause extends object = Lib.ExpressionClause>(
  props: ExpressionWidgetProps<Clause>,
): JSX.Element => {
  const {
    query,
    stageIndex,
    name: initialName,
    expression: initialExpression,
    clause: initialClause,
    withName = false,
    startRule,
    reportTimezone,
    header,
    expressionIndex,
    onChangeExpression,
    onChangeClause,
    onRemoveExpression,
    onClose,
  } = props;

  const [name, setName] = useState(initialName || "");
  const [expression, setExpression] = useState<Expression | null>(
    initialExpression ?? null,
  );
  const [clause, setClause] = useState<Clause | Lib.ExpressionClause | null>(
    initialClause ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isCombiningColumns, setIsCombiningColumns] = useState(false);

  const [isExtractingColumn, setIsExtractingColumn] = useState(false);

  const isValidName = withName ? name.trim().length > 0 : true;
  const isValidExpression = isNotNull(expression) && isExpression(expression);
  const isValidExpressionClause = isNotNull(clause);
  const isValid =
    !error && isValidName && (isValidExpression || isValidExpressionClause);

  const handleCommit = (
    expression: Expression | null,
    clause: Clause | Lib.ExpressionClause | null,
  ) => {
    const isValidExpression = isNotNull(expression) && isExpression(expression);
    const isValidExpressionClause = isNotNull(clause);
    const isValid =
      !error && isValidName && (isValidExpression || isValidExpressionClause);

    if (!isValid) {
      return;
    }

    if (isValidExpression) {
      onChangeExpression?.(name, expression);
      onClose?.();
    }

    if (isValidExpressionClause) {
      onChangeClause?.(name, clause);
      onClose?.();
    }
  };

  const handleExpressionChange = (
    expression: Expression | null,
    clause: Lib.ExpressionClause | null,
  ) => {
    setExpression(expression);
    setClause(clause);
    setError(null);
  };

  if (isCombiningColumns) {
    const handleSubmit = (name: string, clause: Lib.ExpressionClause) => {
      trackColumnCombineViaShortcut(query);
      const expression = Lib.legacyExpressionForExpressionClause(
        query,
        stageIndex,
        clause,
      );
      handleExpressionChange(expression, clause);
      setName(name);
      setIsCombiningColumns(false);
    };

    const handleCancel = () => {
      setIsCombiningColumns(false);
    };

    return (
      <Container data-testid="expression-editor">
        <ExpressionWidgetHeader
          title={t`Select columns to combine`}
          onBack={handleCancel}
        />
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          onSubmit={handleSubmit}
        />
      </Container>
    );
  }

  if (isExtractingColumn) {
    const handleSubmit = (
      clause: Lib.ExpressionClause,
      name: string,
      extraction: Lib.ColumnExtraction,
    ) => {
      trackColumnExtractViaShortcut(query, stageIndex, extraction);
      const expression = Lib.legacyExpressionForExpressionClause(
        query,
        stageIndex,
        clause,
      );
      handleExpressionChange(expression, clause);
      setName(name);
      setIsExtractingColumn(false);
    };

    return (
      <Container data-testid="expression-editor">
        <ExtractColumn
          query={query}
          stageIndex={stageIndex}
          onCancel={() => setIsExtractingColumn(false)}
          onSubmit={handleSubmit}
        />
      </Container>
    );
  }

  return (
    <Container data-testid="expression-editor">
      {header}
      <ExpressionFieldWrapper>
        <FieldLabel htmlFor="expression-content">
          {t`Expression`}
          <ExpressionWidgetInfo />
        </FieldLabel>
        <ExpressionEditorTextfield
          expression={expression}
          expressionIndex={expressionIndex}
          clause={clause}
          startRule={startRule}
          name={name}
          query={query}
          stageIndex={stageIndex}
          reportTimezone={reportTimezone}
          textAreaId="expression-content"
          onChange={handleExpressionChange}
          onCommit={handleCommit}
          onError={(errorMessage: string) => setError(errorMessage)}
          shortcuts={[
            !startRule &&
              hasCombinations(query, stageIndex) && {
                shortcut: true,
                name: t`Combine columns`,
                action: () => setIsCombiningColumns(true),
                group: "shortcuts",
                icon: "combine",
              },
            !startRule &&
              hasExtractions(query, stageIndex) && {
                shortcut: true,
                name: t`Extract columns`,
                icon: "arrow_split",
                group: "shortcuts",
                action: () => setIsExtractingColumn(true),
              },
          ].filter(Boolean)}
        />
      </ExpressionFieldWrapper>
      {withName && (
        <FieldWrapper>
          <FieldLabel htmlFor="expression-name">{t`Name`}</FieldLabel>
          <Input
            id="expression-name"
            data-testid="expression-name"
            type="text"
            value={name}
            placeholder={t`Something nice and descriptive`}
            fullWidth
            onChange={event => setName(event.target.value)}
            onKeyPress={e => {
              if (e.key === "Enter") {
                handleCommit(expression, clause);
              }
            }}
          />
        </FieldWrapper>
      )}

      <Footer>
        <ActionButtonsWrapper>
          {onClose && <Button onClick={onClose}>{t`Cancel`}</Button>}
          <Button
            variant={isValid ? "filled" : "default"}
            disabled={!isValid}
            onClick={() => handleCommit(expression, clause)}
          >
            {initialName ? t`Update` : t`Done`}
          </Button>

          {initialName && onRemoveExpression ? (
            <RemoveLink
              onlyText
              onClick={() => {
                onRemoveExpression(initialName);
                onClose && onClose();
              }}
            >{t`Remove`}</RemoveLink>
          ) : null}
        </ActionButtonsWrapper>
      </Footer>
    </Container>
  );
};
