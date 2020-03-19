import React from "react";
import { t } from "ttag";

import Toggle from "metabase/components/Toggle";

const HIDDEN_STYLE = { height: 0, overflow: "hidden" };

const FormToggleWidget = ({
  field,
  horizontal = false,
  showEnabledLabel = !horizontal,
}) => (
  <div className="flex align-center">
    <Toggle aria-labelledby={`${field.name}-label`} {...field} />
    {showEnabledLabel && (
      <span className="text-bold mx1">
        {/* HACK: ensure a consistent width by always rendering both labels */}
        <div style={field.value ? {} : HIDDEN_STYLE}>{t`Enabled`}</div>
        <div style={field.value ? HIDDEN_STYLE : {}}>{t`Disabled`}</div>
      </span>
    )}
  </div>
);

export default FormToggleWidget;
