import React from "react";
import { t } from "ttag";

import Toggle from "metabase/components/Toggle";

const FormToggleWidget = ({
  field,
  horizontal = false,
  showEnabledLabel = !horizontal,
}) => (
  <div className="flex align-center">
    <Toggle {...field} />
    {showEnabledLabel && (
      <span className="text-bold mx1">
        {field.value ? t`Enabled` : t`Disabled`}
      </span>
    )}
  </div>
);

export default FormToggleWidget;
