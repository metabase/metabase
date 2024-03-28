import type { Location } from "history";
import { useEffect, useState } from "react";
import { push, replace } from "react-router-redux";
import { usePrevious } from "react-use";
import _ from "underscore";

import { getIdFromSlug, initTabs } from "metabase/dashboard/actions";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SelectedTabId } from "metabase-types/store";

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

function useUpdateURLSlug({ location }: { location: Location }) {
  const dispatch = useDispatch();

  return {
    updateURLSlug: ({
      slug,
      shouldReplace = false,
    }: {
      slug: string;
      shouldReplace?: boolean;
    }) => {
      const updater = shouldReplace ? replace : push;

      const newQuery = slug
        ? { ...location.query, tab: slug }
        : _.omit(location.query, "tab");
      dispatch(updater({ ...location, query: newQuery }));
    },
  };
}

export function useSyncURLSlug({ location }: { location: Location }) {
  const [tabInitialized, setTabInitialized] = useState(false);

  const slug = parseSlug({ location });
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  const prevSlug = usePrevious(slug);
  const prevTabs = usePrevious(tabs);
  const prevSelectedTabId = usePrevious(selectedTabId);

  const dispatch = useDispatch();
  const { updateURLSlug } = useUpdateURLSlug({ location });

  useEffect(() => {
    const slugChanged = slug && slug !== prevSlug;
    if (slugChanged) {
      dispatch(initTabs({ slug }));
      const slugId = getIdFromSlug(slug);
      const hasTabs = tabs.length > 0;
      const isValidSlug = !!tabs.find(t => t.id === slugId);
      if (hasTabs && !isValidSlug) {
        const [tab] = tabs;
        updateURLSlug({ slug: getSlug({ tabId: tab.id, name: tab.name }) });
      }
      return;
    }

    const tabSelected = selectedTabId !== prevSelectedTabId;
    const tabRenamed =
      tabs.find(t => t.id === selectedTabId)?.name !==
      prevTabs?.find(t => t.id === selectedTabId)?.name;
    const penultimateTabDeleted = tabs.length === 1 && prevTabs?.length === 2;

    if (tabSelected || tabRenamed || penultimateTabDeleted) {
      const newSlug =
        tabs.length <= 1
          ? ""
          : getSlug({
              tabId: selectedTabId,
              name: tabs.find(t => t.id === selectedTabId)?.name,
            });
      updateURLSlug({
        slug: newSlug,
        shouldReplace: !tabInitialized,
      });

      if (newSlug) {
        setTabInitialized(true);
      }
    }
  }, [
    tabInitialized,
    slug,
    selectedTabId,
    tabs,
    prevSlug,
    prevSelectedTabId,
    prevTabs,
    dispatch,
    updateURLSlug,
  ]);
}
