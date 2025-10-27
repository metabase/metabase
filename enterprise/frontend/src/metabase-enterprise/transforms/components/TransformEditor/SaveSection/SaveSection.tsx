import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

type SaveSectionProps = {
  query: Lib.Query;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function SaveSection({
  query,
  isSaving,
  onSave,
  onCancel,
}: SaveSectionProps) {
  const { isValid, errorMessage } = getValidationResult(query);

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

function getValidationResult(query: Lib.Query): ValidationResult {
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
