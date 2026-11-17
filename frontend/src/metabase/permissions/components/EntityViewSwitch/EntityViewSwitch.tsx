import { t } from "ttag";

import { PLUGIN_PERMISSION_PREVIEW } from "metabase/plugins";
import { Tabs } from "metabase/ui";

import S from "./EntityViewSwitch.module.css";

export type EntityView = "group" | "database" | "collection" | "preview";

const DEFAULT_VIEWS: EntityView[] = ["group", "database"];

interface EntityViewSwitchProps {
  value: EntityView;
  views?: EntityView[];
  onChange: (value: EntityView) => void;
}

export const EntityViewSwitch = ({
  value,
  views = DEFAULT_VIEWS,
  onChange,
}: EntityViewSwitchProps) => {
  const allViews = PLUGIN_PERMISSION_PREVIEW.isEnabled
    ? [...views, "preview" as const]
    : views;

  if (allViews.length < 2) {
    return null;
  }

  return (
    <div className={S.EntityViewSwitchRoot}>
      <Tabs
        variant="pills"
        value={value}
        onChange={(value) => value && onChange(value)}
      >
        <Tabs.List>
          {allViews.map((view) => (
            // Three pills only fit the sidebar's width with narrower padding.
            <Tabs.Tab
              key={view}
              value={view}
              px={allViews.length > 2 ? "sm" : undefined}
            >
              {getViewName(view)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </div>
  );
};

function getViewName(view: EntityView) {
  switch (view) {
    case "group":
      return t`Groups`;
    case "database":
      return t`Databases`;
    case "collection":
      return t`Collections`;
    case "preview":
      return t`Preview`;
  }
}
