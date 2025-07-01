import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";

import S from "./DashboardCopyModalShallowCheckboxLabel.module.css";

export const DashboardCopyModalShallowCheckboxLabel = ({
  hasDashboardQuestions,
}: {
  hasDashboardQuestions: boolean;
}) => (
  <div className={S.checkboxLabelRoot}>
    {t`Only duplicate the dashboard`}
    <Tooltip
      label={
        hasDashboardQuestions
          ? t`Only available when none of the questions are saved to the dashboard.`
          : t`If you check this, the cards in the duplicated dashboard will reference the original questions.`
      }
    >
      <Icon name="info" size={18} />
    </Tooltip>
  </div>
);
