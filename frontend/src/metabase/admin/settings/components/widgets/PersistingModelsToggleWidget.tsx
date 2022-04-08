import React from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";

import { PersistedModelsApi } from "metabase/services";

type Props = {
  setting: {
    key: string;
    value: boolean | string;
    default: number;
    options: Record<string, string>;
  };
  disabled?: boolean;
  onChangeSetting: (setting: string, value: unknown) => void;
};

const PersistingModelsToggleWidget = ({
  setting,
  onChangeSetting,
  disabled,
}: Props) => {
  const value = setting.value == null ? setting.default : setting.value;
  const on = value === true || value === "true";

  async function onChange() {
    if (disabled) {
      return;
    }
    if (on) {
      await PersistedModelsApi.disablePersistence();
    } else {
      await PersistedModelsApi.enablePersistence();
    }
    onChangeSetting(setting.key, !on);
  }

  return (
    <div className="flex align-center pt1">
      <Toggle value={on} onChange={onChange} />
      <span className="text-bold mx1">{on ? t`Enabled` : t`Disabled`}</span>
    </div>
  );
};

export default PersistingModelsToggleWidget;
