import { ReactNode, useRef, useState } from "react";
import { t } from "ttag";
import { isNotNull } from "metabase/core/utils/types";
import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input/Input";
import Tooltip from "metabase/core/components/Tooltip";
import MetabaseSettings from "metabase/lib/settings";
import type { Expression } from "metabase-types/api";
import { isExpression } from "metabase-lib/expressions";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { ExpressionEditorTextfield } from "./ExpressionEditorTextfield";
import {
  ActionButtonsWrapper,
  Container,
  ExpressionFieldWrapper,
  FieldLabel,
  FieldWrapper,
  Footer,
  InfoLink,
  RemoveLink,
  StyledFieldTitleIcon,
} from "./ExpressionWidget.styled";

const EXPRESSIONS_DOCUMENTATION_URL = MetabaseSettings.docsUrl(
  "questions/query-builder/expressions",
);

export interface ExpressionWidgetProps {
  query: StructuredQuery;
  expression: Expression | undefined;
  name?: string;
  withName?: boolean;
  startRule?: string;
  reportTimezone?: string;
  header?: ReactNode;

  onChangeExpression: (name: string, expression: Expression) => void;
  onRemoveExpression?: (name: string) => void;
  onClose?: () => void;
}

export const ExpressionWidget = (props: ExpressionWidgetProps): JSX.Element => {
  const {
    query,
    name: initialName,
    expression: initialExpression,
    withName = false,
    startRule,
    reportTimezone,
    header,
    onChangeExpression,
    onRemoveExpression,
    onClose,
  } = props;

  const [name, setName] = useState(initialName || "");
  const [expression, setExpression] = useState<Expression | null>(
    initialExpression || null,
  );
  const [error, setError] = useState<string | null>(null);

  const helpTextTargetRef = useRef(null);

  const isValidName = withName ? !!name : true;
  const isValidExpression = !!expression && isExpression(expression);

  const isValid = !error && isValidName && isValidExpression;

  const handleCommit = (expression: Expression | null) => {
    if (isValid && isNotNull(expression)) {
      onChangeExpression(name, expression);
      onClose && onClose();
    }
  };

  const handleExpressionChange = (parsedExpression: Expression | null) => {
    setExpression(parsedExpression);
    setError(null);
  };

  return (
    <Container>
      {header}
      <ExpressionFieldWrapper>
        <FieldLabel htmlFor="expression-content">
          {t`Expression`}
          <Tooltip
            tooltip={t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.`}
            placement="right"
            maxWidth={332}
          >
            <InfoLink
              target="_blank"
              href={EXPRESSIONS_DOCUMENTATION_URL}
              aria-label={t`Open expressions documentation`}
            >
              <StyledFieldTitleIcon name="info" />
            </InfoLink>
          </Tooltip>
        </FieldLabel>
        <div ref={helpTextTargetRef}>
          <ExpressionEditorTextfield
            helpTextTarget={helpTextTargetRef.current}
            expression={expression}
            startRule={startRule}
            name={name}
            query={query}
            reportTimezone={reportTimezone}
            textAreaId="expression-content"
            onChange={handleExpressionChange}
            onCommit={handleCommit}
            onError={(errorMessage: string) => setError(errorMessage)}
          />
        </div>
      </ExpressionFieldWrapper>
      {withName && (
        <FieldWrapper>
          <FieldLabel htmlFor="expression-name">{t`Name`}</FieldLabel>
          <Input
            id="expression-name"
            type="text"
            value={name}
            placeholder={t`Something nice and descriptive`}
            fullWidth
            onChange={event => setName(event.target.value)}
            onKeyPress={e => {
              if (e.key === "Enter") {
                handleCommit(expression);
              }
            }}
          />
        </FieldWrapper>
      )}

      <Footer>
        <ActionButtonsWrapper>
          {onClose && <Button onClick={onClose}>{t`Cancel`}</Button>}
          <Button
            primary={isValid}
            disabled={!isValid}
            onClick={() => handleCommit(expression)}
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
