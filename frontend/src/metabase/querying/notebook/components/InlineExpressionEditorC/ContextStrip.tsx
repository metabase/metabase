import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

import { HighlightExpressionSource } from "../../../components/expressions/HighlightExpression";

import S from "./InlineExpressionEditorC.module.css";

type ContextStripProps = {
  /** The code that the prompt changes. */
  source: string;
  onRemove: () => void;
};

/**
 * Version C: the code that the AI prompt changes, across the bottom of the
 * editor. Removing it starts over: no code, no preview.
 */
export function ContextStrip({ source, onRemove }: ContextStripProps) {
  return (
    <div className={S.contextStrip}>
      <div className={S.contextStripCode}>
        <HighlightExpressionSource expression={source} inline />
      </div>
      <ActionIcon
        variant="subtle"
        color="neutral"
        size="sm"
        aria-label={t`Remove the expression`}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </div>
  );
}
