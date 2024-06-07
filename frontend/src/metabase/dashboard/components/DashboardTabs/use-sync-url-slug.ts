import type { Location } from "history";
import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import _, { isEqual } from "underscore";

import { getIdFromSlug, selectTab } from "metabase/dashboard/actions";
import {
  getDashboard,
  getIsEditing,
  getSelectedTabId,
  getTabs,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SelectedTabId } from "metabase-types/store";
import { replace } from "react-router-redux";

export function parseSlug({ location }: { location: Location }) {
  const slug = location.query["tab"];
  if (typeof slug === "string" && slug.length > 0) {
    return slug;
  }
  return undefined;
}

export function getSlug({
  tabId,
  name,
}: {
  tabId: SelectedTabId;
  name: string | undefined;
}) {
  if (tabId === null || tabId < 0 || !name) {
    return "";
  }
  return [tabId, ...name.toLowerCase().split(" ")].join("-");
}

export function useSyncURLSlug({ location }: { location: Location }) {
  const dispatch = useDispatch();

  const tabs = useSelector(getTabs);
  const prevTabs = usePrevious(tabs);

  const slug = parseSlug({ location });
  const prevSlug = usePrevious(slug);

  const slugId = getIdFromSlug(slug);
  const prevSlugId = usePrevious(slugId);

  const selectedId = useSelector(getSelectedTabId);
  const prevSelectedId = usePrevious(selectedId);

  const isEditingDashboard = useSelector(state => Boolean(getIsEditing(state)));
  const prevIsEditingDashboard =
    usePrevious(isEditingDashboard) ?? isEditingDashboard;

  const dashboard = useSelector(getDashboard);
  const prevDashboard = usePrevious(dashboard);

  // INITIALIZATION + CHANGED DASHBOARD

  const isDashboardDataInitializing =
    prevTabs?.length === 0 &&
    tabs &&
    dashboard &&
    prevDashboard?.id !== dashboard?.id;

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isDashboardDataInitializing) {
      console.log("INITIALIZATION", selectedId, slugId);
      if (slugId) {
        dispatch(selectTab({ tabId: slugId }));
      } else if (selectedId) {
        dispatch(
          replace({
            ...location,
            query: {
              ...location.query,
              tab: getSlug({
                tabId: selectedId,
                name: tabs.find(({ id }) => id === selectedId)?.name,
              }),
            },
          }),
        );
      }
      setIsInitialized(true);
    }
  }, [
    dispatch,
    isDashboardDataInitializing,
    location,
    selectedId,
    slugId,
    tabs,
  ]);

  // TAB SWITCHED

  useEffect(() => {
    if (
      !isDashboardDataInitializing &&
      prevTabs &&
      tabs.length > 0 &&
      prevSelectedId !== selectedId &&
      prevTabs.length === tabs.length &&
      slugId !== selectedId &&
      !(prevIsEditingDashboard && !isEditingDashboard)
    ) {
      console.log(
        "TAB SWITCHED",
        selectedId,
        slugId,
        prevSlug,
        prevSelectedId,
        prevIsEditingDashboard,
        isEditingDashboard,
      );
      dispatch(
        replace({
          ...location,
          query: {
            ...location.query,
            tab: getSlug({
              tabId: selectedId,
              name: tabs.find(({ id }) => id === selectedId)?.name,
            }),
          },
        }),
      );
    }
  }, [
    dispatch,
    isDashboardDataInitializing,
    isEditingDashboard,
    location,
    prevIsEditingDashboard,
    prevSelectedId,
    prevSlug,
    prevTabs,
    selectedId,
    slugId,
    tabs,
  ]);

  // LEAVE EDIT MODE
  useEffect(() => {
    if (
      prevIsEditingDashboard &&
      !isEditingDashboard &&
      isEqual(dashboard, prevDashboard)
    ) {
      // console.log(selectedId, slugId, prevTabs, tabs);
      // if (selectedId !== slugId) {
      //   console.log("selecting here", slugId);
      //   dispatch(selectTab({ tabId: slugId ?? null }));
      // }
    }
  }, [
    dashboard,
    dispatch,
    isEditingDashboard,
    prevDashboard,
    prevIsEditingDashboard,
    prevTabs,
    selectedId,
    slugId,
    tabs,
  ]);

  // RENAME TAB / MODIFY TAB / ADD TAB / DELETE TAB

  useEffect(() => {
    if (isEditingDashboard && !isEqual(tabs, prevTabs)) {
      if (prevTabs.length < tabs.length) {
        console.log("ADD TAB");
      } else if (prevTabs.length > tabs.length) {
        console.log("DELETE TAB");
      } else {
        console.log("RENAME TAB / MOVE TAB");
      }
    }
  }, [isEditingDashboard, prevTabs, tabs]);

  useEffect(() => {
    if (!isEditingDashboard) {
      const hasDashboardChanged = !isEqual(dashboard, prevDashboard);

      console.log({ hasDashboardChanged });
      console.log(selectedId, prevSelectedId, tabs, prevTabs);
      console.log(slug, slugId);
      const isCurrentSlugIdValue = tabs.find(({ id }) => id === slugId);

      const isNextSlugIdValue = tabs.find(({ id }) => id === selectedId);

      if (
        !isNextSlugIdValue &&
        isCurrentSlugIdValue &&
        slugId &&
        slugId !== selectedId
      ) {
        console.log("SELECTING", slugId);
        dispatch(selectTab({ tabId: slugId }));
        const nextSlug = getSlug({
          tabId: slugId,
          name: tabs.find(({ id }) => id === slugId)?.name,
        });

        if (!isEditingDashboard && nextSlug !== slug) {
          dispatch(
            replace({
              ...location,
              query: {
                ...location.query,
                tab: nextSlug,
              },
            }),
          );
        }
      } else {
        const nextSlug = getSlug({
          tabId: selectedId,
          name: tabs.find(({ id }) => id === selectedId)?.name,
        });

        console.log(isInitialized, nextSlug, slug);

        if (!isEditingDashboard && isInitialized && nextSlug !== slug) {
          dispatch(
            replace({
              ...location,
              query: {
                ...location.query,
                tab: nextSlug,
              },
            }),
          );
        }
      }
    }
  }, [
    dispatch,
    isEditingDashboard,
    isInitialized,
    location,
    prevSelectedId,
    prevTabs,
    selectedId,
    slug,
    tabs,
  ]);
}
