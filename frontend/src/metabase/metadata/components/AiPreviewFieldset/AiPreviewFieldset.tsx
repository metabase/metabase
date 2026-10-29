import type { ReactNode } from "react";
import { t } from "ttag";

import { Text } from "metabase/ui";

import S from "./AiPreviewFieldset.module.css";

type AiPreviewFieldsetProps = {
  /** Whether the content shows pending AI suggestions as if accepted. The content is then read-only. */
  isPreview: boolean;
  children: ReactNode;
};

/**
 * The preview values are not saved values, so an edit or an undo must not start from them. A disabled fieldset
 * disables every form control in it; links still work.
 */
export function AiPreviewFieldset({
  isPreview,
  children,
}: AiPreviewFieldsetProps) {
  return (
    <fieldset
      className={S.fieldset}
      disabled={isPreview}
      data-testid="ai-preview-fieldset"
    >
      {isPreview && (
        <Text c="text-secondary" mb="md" size="sm">
          {t`Showing the AI suggestions as if accepted. Turn off the preview to edit.`}
        </Text>
      )}
      {children}
    </fieldset>
  );
}
