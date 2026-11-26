import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/Sidebar";
import { SidebarLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { getSimulatedDataApps } from "./simulated-data-apps";
import {
  DATA_APPS_GUIDE_URL,
  useDiscoveryVariant,
  useSimulatedDataApps,
  useSimulatedIsAdmin,
} from "./use-discovery-variant";

interface DataAppsNavSectionProps {
  isGuideSelected: boolean;
  onItemSelect: () => void;
}

/**
 * PROTOTYPE: the "Data apps" side nav section. In the "Side nav" and "Both" variants it points admins to the guide
 * page: with a "Guide" item while there are no data apps, and with a book icon on the heading once there are.
 * Everyone else only sees the section when there are data apps to open. The caller checks the license.
 */
export function DataAppsNavSection({
  isGuideSelected,
  onItemSelect,
}: DataAppsNavSectionProps) {
  const { variant } = useDiscoveryVariant();
  const { simulation } = useSimulatedDataApps();
  const isAdmin = useSimulatedIsAdmin();
  const { data: realDataApps = [] } = PLUGIN_DATA_APPS.useDataApps({
    skip: simulation !== "real",
  });
  const hasGuideEntryPoint = variant === "side-nav" || variant === "both";

  // Nothing here differs from the shipped section, so it renders as is.
  if (simulation === "real" && !hasGuideEntryPoint) {
    return <PLUGIN_DATA_APPS.MainNavbarSection onItemSelect={onItemSelect} />;
  }

  const dataApps = getSimulatedDataApps(simulation, realDataApps).filter(
    (dataApp) => dataApp.enabled && !dataApp.outdated,
  );
  const showsGuideEntryPoint = hasGuideEntryPoint && isAdmin;

  if (dataApps.length === 0 && !showsGuideEntryPoint) {
    return null;
  }

  return (
    <SidebarSection>
      <CollapseSection
        header={<SidebarHeading>{t`Data apps`}</SidebarHeading>}
        initialState="expanded"
        iconPosition="right"
        iconSize={8}
        aria-label={t`Data apps`}
        rightAction={
          showsGuideEntryPoint && dataApps.length > 0 ? (
            <Tooltip label={t`How to create a data app`}>
              <ActionIcon
                component={ForwardRefLink}
                to={DATA_APPS_GUIDE_URL}
                variant="subtle"
                aria-label={t`How to create a data app`}
                onClick={onItemSelect}
              >
                <Icon name="book_open" />
              </ActionIcon>
            </Tooltip>
          ) : undefined
        }
      >
        {dataApps.length === 0 ? (
          <SidebarLink
            icon="book_open"
            url={DATA_APPS_GUIDE_URL}
            isSelected={isGuideSelected}
            onClick={onItemSelect}
          >
            {t`Guide`}
          </SidebarLink>
        ) : (
          dataApps.map((dataApp) => (
            <SidebarLink
              key={dataApp.slug}
              icon="app"
              url={Urls.dataApp(dataApp.slug)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onItemSelect}
            >
              {dataApp.name}
            </SidebarLink>
          ))
        )}
      </CollapseSection>
    </SidebarSection>
  );
}
