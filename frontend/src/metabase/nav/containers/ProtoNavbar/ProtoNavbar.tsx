import cx from "classnames";
import type { Location } from "history";
import { VisualState, useKBar } from "kbar";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { NewItemMenu } from "metabase/common/components/NewItemMenu";
import { useDispatch, useSelector } from "metabase/redux";
import type { StoreDashboard } from "metabase/redux/store";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { ActionIcon, Box, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { Sidebar } from "../MainNavbar/MainNavbar.styled";

import { NotificationsButton } from "./NotificationsButton";
import { ProtoNavMoreMenu } from "./ProtoNavMoreMenu";
import S from "./ProtoNavbar.module.css";
import {
  type SectionId,
  consumeProtoNavSectionPin,
  getActiveSection,
} from "./getActiveSection";
import { CollectionsSection } from "./sections/CollectionsSection";
import { DataSection } from "./sections/DataSection";
import { LibrarySection } from "./sections/LibrarySection";
import { MonitorSection } from "./sections/MonitorSection";
import { PlaygroundSection } from "./sections/PlaygroundSection";

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

  const sectionMeta: Record<SectionId, { label: string; icon: IconName }> = {
    collections: { label: t`Collections`, icon: "collection" },
    data: { label: t`Data`, icon: "database" },
    library: { label: t`Library`, icon: "repository" },
    playground: { label: t`Playground`, icon: "play" },
    monitor: { label: t`Monitor`, icon: "gauge" },
  };

  // Top-level sections listed in the nav, in order. "playground" stays routable
  // but is intentionally omitted from the list.
  const navSections: SectionId[] = [
    "collections",
    "data",
    "library",
    "monitor",
  ];

  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const { data: collectionsTree = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });
  const usageAnalytics = collectionsTree.find(
    (collection) => collection.type === "instance-analytics",
  );
  const personalCollection = collectionsTree.find(
    (collection) => collection.id === personalCollectionId,
  );

  const defaultPaths: Partial<Record<SectionId, string>> = {
    collections: "/",
    library: Urls.dataStudioLibrary({ library: "tables" }),
    data: "/browse/databases",
    playground: personalCollection
      ? Urls.collection(personalCollection)
      : undefined,
    monitor: usageAnalytics ? Urls.collection(usageAnalytics) : undefined,
  };

  const routeSection = useMemo(
    () => getActiveSection(location.pathname, personalCollectionId),
    [location.pathname, personalCollectionId],
  );

  // `null` shows the top-level section list; otherwise we're drilled into a
  // section and show its sub-nav with a back header.
  const [expandedSection, setExpandedSection] = useState<SectionId | null>(
    routeSection,
  );
  const [collectionsVisitKey, setCollectionsVisitKey] = useState(0);
  const prevExpandedSectionRef = useRef<SectionId | null>(routeSection);

  // Lets a section "pin" itself so the next route change doesn't steal the
  // selection away (e.g. launching a SQL query lands on /question, which would
  // otherwise switch the nav back to Collections).
  const pinnedSectionRef = useRef<SectionId | null>(null);
  const pinSection = useCallback((section: SectionId) => {
    pinnedSectionRef.current = section;
    setExpandedSection(section);
  }, []);

  const openSection = (section: SectionId) => {
    setExpandedSection(section);
    // Already on this section's route? Just drill in and keep the context.
    if (routeSection === section) {
      return;
    }
    const target = defaultPaths[section];
    if (target) {
      pinSection(section);
      dispatch(push(target));
    }
  };

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

  // Keep the expanded section in sync with the route as the user navigates.
  useEffect(() => {
    const pendingPin = consumeProtoNavSectionPin();
    if (pendingPin) {
      setExpandedSection(pendingPin);
      pinnedSectionRef.current = null;
      return;
    }
    if (pinnedSectionRef.current) {
      setExpandedSection(pinnedSectionRef.current);
      pinnedSectionRef.current = null;
      return;
    }
    if (routeSection) {
      setExpandedSection(routeSection);
    }
  }, [routeSection]);

  // Remount the collections nav when entering the section so Our Analytics
  // starts expanded every time.
  useEffect(() => {
    if (
      expandedSection === "collections" &&
      prevExpandedSectionRef.current !== "collections"
    ) {
      setCollectionsVisitKey((key) => key + 1);
    }
    prevExpandedSectionRef.current = expandedSection;
  }, [expandedSection]);

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
          <ForwardRefLink
            to="/"
            className={S.logoLink}
            aria-label={applicationName}
          >
            <LogoIcon height={32} />
          </ForwardRefLink>
          <Group className={S.headerIconActions} gap="0.25rem" wrap="nowrap">
            <Tooltip label={t`Search`} openDelay={1000}>
              <ActionIcon
                aria-label={t`Search`}
                c="icon-secondary"
                onClick={openSearch}
              >
                <FixedSizeIcon name="search" />
              </ActionIcon>
            </Tooltip>
            <NewItemMenu
              trigger={
                <Tooltip label={t`New`} openDelay={1000}>
                  <ActionIcon aria-label={t`New`} c="icon-secondary">
                    <FixedSizeIcon name="add" />
                  </ActionIcon>
                </Tooltip>
              }
            />
          </Group>
        </Box>

        {expandedSection === null ? (
          <Box className={S.navList} role="list" aria-label={t`Sections`}>
            {navSections.map((id) => {
              const { label, icon } = sectionMeta[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={S.navListItem}
                  onClick={() => openSection(id)}
                >
                  <FixedSizeIcon name={icon} className={S.navListItemIcon} />
                  <span className={S.navListItemLabel}>{label}</span>
                </button>
              );
            })}
          </Box>
        ) : (
          <>
            <button
              type="button"
              className={S.backHeader}
              aria-label={t`Back to sections`}
              onClick={() => setExpandedSection(null)}
            >
              <FixedSizeIcon
                name="chevronleft"
                className={S.backHeaderChevron}
              />
              <span className={S.backHeaderLabel}>
                {sectionMeta[expandedSection].label}
              </span>
            </button>

            <Box className={S.sectionContent}>
              {expandedSection === "collections" && (
                <CollectionsSection
                  key={collectionsVisitKey}
                  isOpen={isOpen}
                  location={location}
                  params={params}
                />
              )}
              {expandedSection === "library" && (
                <LibrarySection location={location} />
              )}
              {expandedSection === "playground" && (
                <PlaygroundSection location={location} />
              )}
              {expandedSection === "data" && (
                <DataSection location={location} />
              )}
              {expandedSection === "monitor" && (
                <MonitorSection location={location} />
              )}
            </Box>
          </>
        )}

        <Box className={S.footer}>
          <NotificationsButton />
          <ProtoNavMoreMenu />
        </Box>
      </Box>
    </Sidebar>
  );
}
