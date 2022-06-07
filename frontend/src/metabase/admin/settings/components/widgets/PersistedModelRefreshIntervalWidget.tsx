import React from "react";

import Radio from "metabase/core/components/Radio";

type Props = {
  setting: {
    key: string;
    value: number;
    default: number;
    options: Record<string, string>;
  };
  disabled?: boolean;
  onChange: (hours: number) => void;
};

const PersistedModelRefreshIntervalWidget = ({
  setting,
  disabled,
  onChange,
}: Props) => {
  return (
    <Radio
      className="mt2"
      variant="bubble"
      disabled={disabled}
      value={setting.value || setting.default}
      onChange={(hours: number) => onChange(hours)}
      options={Object.entries(setting.options).map(([value, name]) => ({
        name,
        value: Number(value),
      }))}
    />
  );
};

export default PersistedModelRefreshIntervalWidget;
