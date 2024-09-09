import cx from "classnames";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import EditBar from "metabase/components/EditBar";
import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import type Question from "metabase-lib/v1/Question";

import S from "./MetricEditorHeader.module.css";

type MetricEditorHeaderProps = {
  question: Question;
  onCreate: (question: Question) => void;
  onSave: (question: Question) => Promise<void>;
};

export function MetricEditorHeader({
  question,
  onCreate,
  onSave,
}: MetricEditorHeaderProps) {
  const handleCreate = () => onCreate(question);
  const handleSave = () => onSave(question);

  return (
    <EditBar
      className={S.bar}
      title={question.displayName() ?? t`New metric`}
      buttons={[
        <Button key="cancel" small>{t`Cancel`}</Button>,
        !question.isSaved() ? (
          <Button key="create" primary small onClick={handleCreate}>
            {t`Save`}
          </Button>
        ) : (
          <ActionButton
            key="save"
            actionFn={handleSave}
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
