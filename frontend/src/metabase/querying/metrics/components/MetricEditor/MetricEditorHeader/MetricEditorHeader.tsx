import { useRef } from "react";
import { t } from "ttag";

import {
  ActionButton,
  type ActionButtonHandle,
} from "metabase/common/components/ActionButton";
import { EditBar } from "metabase/common/components/EditBar";
import { Button } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import S from "./MetricEditorHeader.module.css";

type MetricEditorHeaderProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  onCreate: (question: Question) => void;
  onSave: (question: Question) => Promise<void>;
  onCancel: () => void;
};

export function MetricEditorHeader({
  question,
  isDirty,
  isRunnable,
  onCreate,
  onSave,
  onCancel,
}: MetricEditorHeaderProps) {
  const saveButtonRef = useRef<ActionButtonHandle>(null);
  const handleCreate = () => onCreate(question);
  const handleSave = () => onSave(question);

  return (
    <EditBar
      className={S.root}
      title={question.displayName() ?? t`New metric`}
      buttons={[
        <Button key="cancel" variant="subtle" size="sm" onClick={onCancel}>
          {t`Cancel`}
        </Button>,
        !question.isSaved() ? (
          <Button
            key="create"
            variant="filled"
            size="sm"
            onClick={handleCreate}
          >
            {t`Save`}
          </Button>
        ) : (
          <ActionButton
            ref={saveButtonRef}
            key="save"
            actionFn={handleSave}
            disabled={!isRunnable || !isDirty}
            normalText={t`Save changes`}
            activeText={t`Saving…`}
            failedText={t`Save failed`}
            successText={t`Saved`}
            variant="filled"
            size="sm"
          />
        ),
      ]}
    />
  );
}
