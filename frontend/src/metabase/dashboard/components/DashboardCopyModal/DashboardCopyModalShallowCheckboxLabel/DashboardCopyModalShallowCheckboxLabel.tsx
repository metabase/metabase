import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { CheckboxLabelRoot } from "./DashboardCopyModalShallowCheckboxLabel.styled";

const DashboardCopyModalShallowCheckboxLabel = () => (
  <CheckboxLabelRoot>
    {t`Only duplicate the dashboard`}
    <Tooltip
      tooltip={t`If you check this, the cards in the duplicated dashboard will reference the original questions.`}
    >
      <Icon name="info" size={18} />
    </Tooltip>
  </CheckboxLabelRoot>
);

export default DashboardCopyModalShallowCheckboxLabel;
