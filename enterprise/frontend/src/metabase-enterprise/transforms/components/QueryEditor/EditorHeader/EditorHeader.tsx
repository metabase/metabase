import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type EditorHeaderProps = {
  question: Question;
  isNew: boolean;
  isQueryDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorHeader({
  question,
  isNew,
  isQueryDirty,
  isSaving,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  const query = question.query();
  const canSave = canSaveTransform(query, isNew, isQueryDirty, isSaving);
  const saveButtonLabel = getSaveButtonLabel(isNew, isSaving);
  const saveButtonTooltip = getSaveButtonTooltip(query);

  return (
    <EditBar
      title={getTitle(isNew)}
      admin
      buttons={[
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        <Tooltip
          key="save"
          label={saveButtonTooltip}
          disabled={saveButtonTooltip == null}
        >
          <Button onClick={onSave} primary small disabled={!canSave}>
            {saveButtonLabel}
          </Button>
        </Tooltip>,
      ]}
    />
  );
}

function getTitle(isNew: boolean) {
  if (isNew) {
    return t`You’re creating a new transform`;
  } else {
    return t`You’re editing a transform`;
  }
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}

function canSaveTransform(
  query: Lib.Query,
  isNew: boolean,
  isQueryDirty: boolean,
  isSaving: boolean,
) {
  return (
    (isNew || isQueryDirty) &&
    !isSaving &&
    Lib.canSave(query, "question") &&
    areTemplateTagsValid(query)
  );
}

function getSaveButtonTooltip(query: Lib.Query) {
  if (!areTemplateTagsValid(query)) {
    return `Variables in transforms aren't supported.`;
  }
}

function areTemplateTagsValid(query: Lib.Query) {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (!isNative) {
    return true;
  }

  const tags = Object.values(Lib.templateTags(query));
  return tags.every((t) => t.type === "card" || t.type === "snippet");
}
