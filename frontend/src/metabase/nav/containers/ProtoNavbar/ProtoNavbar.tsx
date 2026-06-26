import cx from "classnames";
import type { Location } from "history";
import { VisualState, useKBar } from "kbar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { useSelector } from "metabase/redux";
import type { StoreDashboard } from "metabase/redux/store";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Group,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { Sidebar } from "../MainNavbar/MainNavbar.styled";

import S from "./ProtoNavbar.module.css";
import { type SectionId, getActiveSection } from "./getActiveSection";
import { CollectionsSection } from "./sections/CollectionsSection";
import { DataSection } from "./sections/DataSection";
import { ExploreSection } from "./sections/ExploreSection";
import { LibrarySection } from "./sections/LibrarySection";
import { MonitorSection } from "./sections/MonitorSection";

type Props = {
  isOpen: boolean;
  location: Location;
  params: { slug?: string; pageId?: string };
  dashboard?: StoreDashboard;
};

export function ProtoNavbar({ isOpen, location, params }: Props) {
  const applicationName = useSelector(getApplicationName);
  const { query: kbarQuery } = useKBar();
  const openSearch = useCallback(() => {
    kbarQuery.setVisualState(VisualState.showing);
  }, [kbarQuery]);

  const sections: { id: SectionId; label: string; icon: IconName }[] = [
    { id: "collections", label: t`Collections`, icon: "folder" },
    { id: "explore", label: t`Explore`, icon: "sparkles" },
    { id: "library", label: t`Library`, icon: "repository" },
    { id: "data", label: t`Data`, icon: "database" },
    { id: "monitor", label: t`Monitor`, icon: "gauge" },
  ];

  const routeSection = useMemo(
    () => getActiveSection(location.pathname),
    [location.pathname],
  );
  const [activeSection, setActiveSection] = useState<SectionId>(
    routeSection ?? "collections",
  );

  // Keep the selected icon in sync with the route as the user navigates.
  useEffect(() => {
    if (routeSection) {
      setActiveSection(routeSection);
    }
  }, [routeSection]);

  return (
    <Sidebar
      isOpen={isOpen}
      side="left"
      width="320px"
      aria-hidden={!isOpen}
      data-testid="proto-navbar-root"
      data-element-id="navbar-root"
    >
      <Box className={S.root}>
        <Box className={S.header}>
          <Group gap="sm" wrap="nowrap" miw={0}>
            <ForwardRefLink
              to="/"
              className={S.logoLink}
              aria-label={applicationName}
            >
              <LogoIcon height={32} />
            </ForwardRefLink>
            <Text fw={700} fz="md" truncate>
              {applicationName}
            </Text>
          </Group>
          <Tooltip label={t`Search`}>
            <ActionIcon
              onClick={openSearch}
              aria-label={t`Search`}
              c="text-secondary"
            >
              <FixedSizeIcon name="search" />
            </ActionIcon>
          </Tooltip>
        </Box>

        <Box className={S.rail} role="tablist" aria-label={t`Sections`}>
          {sections.map((section) => {
            const isSelected = activeSection === section.id;
            return (
              <Tooltip
                key={section.id}
                label={section.label}
                position="bottom"
                openDelay={400}
                disabled={isSelected}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-label={section.label}
                  className={cx(S.railBtn, { [S.selected]: isSelected })}
                  onClick={() => setActiveSection(section.id)}
                >
                  <FixedSizeIcon name={section.icon} />
                  <span className={S.railLabel}>{section.label}</span>
                </button>
              </Tooltip>
            );
          })}
        </Box>

        <Box className={S.sectionContent}>
          {activeSection === "collections" && (
            <CollectionsSection
              isOpen={isOpen}
              location={location}
              params={params}
            />
          )}
          {activeSection === "explore" && (
            <ExploreSection location={location} />
          )}
          {activeSection === "library" && (
            <LibrarySection location={location} />
          )}
          {activeSection === "data" && <DataSection location={location} />}
          {activeSection === "monitor" && (
            <MonitorSection location={location} />
          )}
        </Box>

        <Box className={S.footer}>
          <AppSwitcher />
          <Group gap="0.25rem" wrap="nowrap">
            <Tooltip label={t`Alerts`}>
              <ActionIcon
                component={ForwardRefLink}
                to="/admin/tools/notifications"
                aria-label={t`Alerts`}
                c="text-secondary"
              >
                <FixedSizeIcon name="bell" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t`Settings`}>
              <ActionIcon
                component={ForwardRefLink}
                to="/admin/settings"
                aria-label={t`Settings`}
                c="text-secondary"
              >
                <FixedSizeIcon name="gear" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      </Box>
    </Sidebar>
  );
}
