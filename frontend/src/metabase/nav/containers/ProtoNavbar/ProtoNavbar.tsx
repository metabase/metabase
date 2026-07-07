import cx from "classnames";
import type { Location } from "history";
import { VisualState, useKBar } from "kbar";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { useDispatch, useSelector } from "metabase/redux";
import type { StoreDashboard } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Group,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { Sidebar } from "../MainNavbar/MainNavbar.styled";

import { NotificationsButton } from "./NotificationsButton";
import S from "./ProtoNavbar.module.css";
import {
  type SectionId,
  consumeProtoNavSectionPin,
  getActiveSection,
} from "./getActiveSection";
import { getLastNewQueryMode, newQueryUrl } from "./newQuery";
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

const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;
const WIDTH_STORAGE_KEY = "proto-nav-width";

export function ProtoNavbar({ isOpen, location, params }: Props) {
  const applicationName = useSelector(getApplicationName);
  const dispatch = useDispatch();
  const { query: kbarQuery } = useKBar();
  const openSearch = useCallback(() => {
    kbarQuery.setVisualState(VisualState.showing);
  }, [kbarQuery]);

  const sections: { id: SectionId; label: string; icon: IconName }[] = [
    { id: "collections", label: t`Home`, icon: "home" },
    { id: "explore", label: t`Query`, icon: "query" },
    { id: "library", label: t`Library`, icon: "repository" },
    { id: "data", label: t`Data`, icon: "database" },
    { id: "monitor", label: t`Monitor`, icon: "gauge" },
  ];

  // The landing page each section navigates to when its rail icon is clicked.
  const { data: rootDashboards } = useListCollectionItemsQuery({
    id: "root",
    models: ["dashboard"],
    limit: 1,
  });
  const firstDashboard = rootDashboards?.data?.[0];

  const { data: databasesData } = useListDatabasesQuery();
  const firstDatabase = databasesData?.data?.[0];
  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );

  const { data: collectionsTree = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });
  const usageAnalytics = collectionsTree.find(
    (collection) => collection.type === "instance-analytics",
  );

  const defaultPaths: Partial<Record<SectionId, string>> = {
    collections: firstDashboard
      ? `/dashboard/${firstDashboard.id}`
      : "/collection/root",
    explore: newQueryUrl(getLastNewQueryMode(), {
      databaseId: lastUsedDatabaseId ?? undefined,
    }),
    library: Urls.dataStudioLibrary({ library: "tables" }),
    data: firstDatabase
      ? Urls.dataStudioData({ databaseId: firstDatabase.id })
      : undefined,
    monitor: usageAnalytics ? Urls.collection(usageAnalytics) : undefined,
  };

  const routeSection = useMemo(
    () => getActiveSection(location.pathname),
    [location.pathname],
  );
  const [activeSection, setActiveSection] = useState<SectionId>(
    routeSection ?? "collections",
  );
  const [collectionsVisitKey, setCollectionsVisitKey] = useState(0);
  const prevActiveSectionRef = useRef<SectionId>(routeSection ?? "collections");

  // Lets a section "pin" itself so the next route change doesn't steal the
  // selection away (e.g. launching a SQL query lands on /question, which would
  // otherwise switch the rail back to Home).
  const pinnedSectionRef = useRef<SectionId | null>(null);
  const pinSection = useCallback((section: SectionId) => {
    pinnedSectionRef.current = section;
    setActiveSection(section);
  }, []);

  // Resizable width, clamped to [MIN_WIDTH, MAX_WIDTH] and persisted locally.
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isHandleHovered, setIsHandleHovered] = useState(false);
  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  const startResize = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;
      setIsResizing(true);

      const onMove = (moveEvent: MouseEvent) => {
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
        );
        setWidth(next);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setIsResizing(false);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width],
  );

  // Keep the selected icon in sync with the route as the user navigates.
  useEffect(() => {
    const pendingPin = consumeProtoNavSectionPin();
    if (pendingPin) {
      setActiveSection(pendingPin);
      pinnedSectionRef.current = null;
      return;
    }
    if (pinnedSectionRef.current) {
      setActiveSection(pinnedSectionRef.current);
      pinnedSectionRef.current = null;
      return;
    }
    if (routeSection) {
      setActiveSection(routeSection);
    }
  }, [routeSection]);

  // Remount the collections nav when entering the section so Our Analytics
  // starts expanded every time.
  useEffect(() => {
    if (
      activeSection === "collections" &&
      prevActiveSectionRef.current !== "collections"
    ) {
      setCollectionsVisitKey((key) => key + 1);
    }
    prevActiveSectionRef.current = activeSection;
  }, [activeSection]);

  return (
    <Sidebar
      isOpen={isOpen}
      side="left"
      width={`${width}px`}
      className={cx({
        [S.sidebarResizing]: isResizing || isHandleHovered,
      })}
      aria-hidden={!isOpen}
      data-testid="proto-navbar-root"
      data-element-id="navbar-root"
    >
      <div
        className={S.resizeHandle}
        onMouseDown={startResize}
        onMouseEnter={() => setIsHandleHovered(true)}
        onMouseLeave={() => setIsHandleHovered(false)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t`Resize sidebar`}
      />
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
                openDelay={1000}
                disabled={isSelected}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-label={section.label}
                  className={cx(S.railBtn, { [S.selected]: isSelected })}
                  onClick={() => {
                    setActiveSection(section.id);
                    const target = defaultPaths[section.id];
                    if (target) {
                      pinSection(section.id);
                      dispatch(push(target));
                    }
                  }}
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
              key={collectionsVisitKey}
              isOpen={isOpen}
              location={location}
              params={params}
            />
          )}
          {activeSection === "explore" && (
            <ExploreSection
              location={location}
              onPin={() => pinSection("explore")}
            />
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
            <NotificationsButton />
            <Tooltip label={t`Trash`}>
              <ActionIcon
                component={ForwardRefLink}
                to="/trash"
                aria-label={t`Trash`}
                c="text-secondary"
              >
                <FixedSizeIcon name="trash" />
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
