import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";

import S from "./EntityViewSwitch.module.css";

type EntityView = "group" | "database";

interface EntityViewSwitchProps {
  value: EntityView;
  onChange: (value: string) => void;
}

export const EntityViewSwitch = ({
  value,
  onChange,
}: EntityViewSwitchProps) => (
  <div className={S.EntityViewSwitchRoot}>
    <Radio<string>
      variant="bubble"
      colorScheme="accent7"
      options={[
        {
          name: t`Groups`,
          value: "group",
        },
        {
          name: t`Databases`,
          value: "database",
        },
      ]}
      value={value}
      onChange={onChange}
    />
  </div>
);
