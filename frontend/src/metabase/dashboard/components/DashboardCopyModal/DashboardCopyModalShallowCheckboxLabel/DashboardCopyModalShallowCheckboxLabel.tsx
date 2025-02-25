import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import S from "./DashboardCopyModalShallowCheckboxLabel.module.css";

export const DashboardCopyModalShallowCheckboxLabel = ({
  hasDashboardQuestions,
}: {
  hasDashboardQuestions: boolean;
}) => (
  <div className={S.checkboxLabelRoot}>
    {t`Only duplicate the dashboard`}
    <Tooltip
      tooltip={
        hasDashboardQuestions
          ? t`Only available when none of the questions are saved to the dashboard.`
          : t`If you check this, the cards in the duplicated dashboard will reference the original questions.`
      }
    >
      <Icon name="info" size={18} />
    </Tooltip>
  </div>
);
