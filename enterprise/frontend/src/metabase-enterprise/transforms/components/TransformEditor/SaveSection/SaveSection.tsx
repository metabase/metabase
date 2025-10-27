import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type SaveSectionProps = {
  question: Question;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function SaveSection({
  question,
  isSaving,
  onSave,
  onCancel,
}: SaveSectionProps) {
  const { isValid, errorMessage } = getValidationResult(question);

  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip label={errorMessage} disabled={errorMessage == null}>
        <Button
          variant="filled"
          disabled={!isValid || isSaving}
          onClick={onSave}
        >
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}

type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

function getValidationResult(question: Question): ValidationResult {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (isNative) {
    const tags = Object.values(Lib.templateTags(query));
    if (tags.some((t) => t.type !== "card" && t.type !== "snippet")) {
      return {
        isValid: false,
        errorMessage: t`In transforms, you can use snippets and question or model references, but not variables.`,
      };
    }
  }

  return { isValid: Lib.canSave(query, "question") };
}
