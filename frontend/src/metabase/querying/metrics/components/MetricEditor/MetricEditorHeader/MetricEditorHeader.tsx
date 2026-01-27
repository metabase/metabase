import cx from "classnames";
import { useLayoutEffect, useRef } from "react";
import { t } from "ttag";

import {
  ActionButton,
  type ActionButtonHandle,
} from "metabase/common/components/ActionButton";
import { Button } from "metabase/common/components/Button";
import { EditBar } from "metabase/common/components/EditBar";
import ButtonsS from "metabase/css/components/buttons.module.css";
import type Question from "metabase-lib/v1/Question";

import S from "./MetricEditorHeader.module.css";

type MetricEditorHeaderProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isConfirmationShown: boolean;
  onCreate: (question: Question) => void;
  onSave: (question: Question) => Promise<void>;
  onCancel: () => void;
};

export function MetricEditorHeader({
  question,
  isDirty,
  isRunnable,
  isConfirmationShown,
  onCreate,
  onSave,
  onCancel,
}: MetricEditorHeaderProps) {
  const saveButtonRef = useRef<ActionButtonHandle>(null);
  const handleCreate = () => onCreate(question);
  const handleSave = () => onSave(question);

  useLayoutEffect(() => {
    saveButtonRef.current?.resetState();
  }, [isConfirmationShown]);

  return (
    <EditBar
      className={S.root}
      title={question.displayName() ?? t`New metric`}
      buttons={[
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        !question.isSaved() ? (
          <Button key="create" primary small onClick={handleCreate}>
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
            className={cx(
              ButtonsS.Button,
              ButtonsS.ButtonPrimary,
              ButtonsS.ButtonSmall,
            )}
          />
        ),
      ]}
    />
  );
}
