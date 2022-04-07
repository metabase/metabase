import React from "react";

import Radio from "metabase/core/components/Radio";

import { PersistedModelsApi } from "metabase/services";

type Props = {
  setting: {
    key: string;
    value: number;
    default: number;
    options: Record<string, string>;
  };
  disabled?: boolean;
  onChangeSetting: (setting: string, value: unknown) => void;
};

const PersistedModelRefreshIntervalWidget = ({
  setting,
  disabled,
  onChangeSetting,
}: Props) => {
  return (
    <Radio
      className="mt2"
      variant="bubble"
      disabled={disabled}
      value={setting.value || setting.default}
      onChange={async hours => {
        await PersistedModelsApi.setRefreshInterval({ hours });
        onChangeSetting(setting.key, hours);
      }}
      options={Object.entries(setting.options).map(([value, name]) => ({
        name,
        value: Number(value),
      }))}
    />
  );
};

export default PersistedModelRefreshIntervalWidget;
