import { t } from "ttag";

import { Tabs } from "metabase/ui";

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
    <Tabs
      variant="pills"
      value={value}
      onChange={(value) => value && onChange(value)}
    >
      <Tabs.List>
        <Tabs.Tab value="group">{t`Groups`}</Tabs.Tab>
        <Tabs.Tab value="database">{t`Databases`}</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  </div>
);
