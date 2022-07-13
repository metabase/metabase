/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import Toggle from "metabase/core/components/Toggle";

const FormBooleanWidget = ({ field }) => (
  <div className="flex align-center pt1">
    <Toggle
      aria-labelledby={`${field.name}-label`}
      aria-checked={field.value}
      role="switch"
      {...field}
    />
    <span id={`${field.name}-label`} className="text-bold mx1">
      {field.value ? t`Enabled` : t`Disabled`}
    </span>
  </div>
);

export default FormBooleanWidget;
