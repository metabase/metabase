import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import { CheckboxLabelRoot } from "./DashboardCopyModalShallowCheckboxLabel.styled";

export const DashboardCopyModalShallowCheckboxLabel = () => (
  <CheckboxLabelRoot>
    {t`Only duplicate the dashboard`}
    <Tooltip
      tooltip={t`If you check this, the cards in the duplicated dashboard will reference the original questions.`}
    >
      <Icon name="info" size={18} />
    </Tooltip>
  </CheckboxLabelRoot>
);
