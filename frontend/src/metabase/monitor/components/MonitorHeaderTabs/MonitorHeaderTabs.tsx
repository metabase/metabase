import { LinkTab } from "metabase/common/components/LinkTab";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { FixedSizeIcon, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

export type MonitorHeaderTab = {
  label: string;
  to: string;
  icon?: IconName;
  isGated?: boolean;
  isSelected?: boolean | ((pathname: string) => boolean);
};

type MonitorHeaderTabsProps = {
  tabs: MonitorHeaderTab[];
};

function isTabSelected(tab: MonitorHeaderTab, pathname: string) {
  const { to, isSelected } = tab;
  return typeof isSelected === "function"
    ? isSelected(pathname)
    : (isSelected ?? to === pathname);
}

export function MonitorHeaderTabs({ tabs }: MonitorHeaderTabsProps) {
  const { pathname } = useSelector(getLocation);
  const activeTab = tabs.find((tab) => isTabSelected(tab, pathname));

  return (
    <Tabs variant="pills" value={activeTab?.to ?? null}>
      <Tabs.List>
        {tabs.map(({ label, to, icon, isGated }) => (
          <LinkTab
            key={label}
            value={to}
            to={to}
            leftSection={
              icon !== undefined ? <FixedSizeIcon name={icon} /> : null
            }
            rightSection={isGated ? <UpsellGem.New size={14} /> : null}
          >
            {label}
          </LinkTab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
