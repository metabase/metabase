import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

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
