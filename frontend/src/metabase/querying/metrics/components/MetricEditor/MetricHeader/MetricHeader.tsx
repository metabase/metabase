import cx from "classnames";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import EditBar from "metabase/components/EditBar";
import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import type Question from "metabase-lib/v1/Question";

import S from "./MetricHeader.module.css";

type MetricHeaderProps = {
  question: Question;
};

export function MetricHeader({ question }: MetricHeaderProps) {
  return (
    <EditBar
      className={S.bar}
      title={question.displayName() ?? t`New metric`}
      buttons={[
        <Button key="cancel" small>{t`Cancel`}</Button>,
        <ActionButton
          key="save"
          actionFn={() => 0}
          normalText={question.isSaved() ? t`Save changes` : t`Save`}
          activeText={t`Saving…`}
          failedText={t`Save failed`}
          successText={t`Saved`}
          className={cx(
            ButtonsS.Button,
            ButtonsS.ButtonPrimary,
            ButtonsS.ButtonSmall,
          )}
        />,
      ]}
    />
  );
}
