import { useEffect } from "react";
import { usePrevious } from "react-use";
import { push, replace } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SelectedTabId } from "metabase-types/store";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";
import { initTabs } from "metabase/dashboard/actions";

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

export function getPathnameBeforeSlug(pathname: string) {
  const match = pathname.match(/(.*\/dashboard\/[^\/]*)\/?/);
  if (match === null) {
    throw Error("No match with pathname before dashboard tab slug.");
  }
  return match[1];
}

function useUpdateURLSlug({ pathname: oldPathname }: { pathname: string }) {
  const dispatch = useDispatch();

  return {
    updateURLSlug: ({
      slug,
      shouldReplace = false,
    }: {
      slug: string;
      shouldReplace?: boolean;
    }) => {
      const pathname = slug
        ? `${getPathnameBeforeSlug(oldPathname)}/${slug}`
        : getPathnameBeforeSlug(oldPathname);

      const updater = shouldReplace ? replace : push;
      dispatch(updater({ pathname }));
    },
  };
}

export function useSyncURLSlug({
  slug,
  pathname,
}: {
  slug: string | undefined;
  pathname: string;
}) {
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  const prevSlug = usePrevious(slug);
  const prevTabs = usePrevious(tabs);
  const prevSelectedTabId = usePrevious(selectedTabId);

  const dispatch = useDispatch();
  const { updateURLSlug } = useUpdateURLSlug({ pathname });

  useEffect(() => {
    const slugChanged = slug && slug !== prevSlug;
    if (slugChanged) {
      dispatch(initTabs({ slug }));
      return;
    }

    const tabSelected = selectedTabId !== prevSelectedTabId;
    const tabInitialized = selectedTabId != null && prevSelectedTabId == null;
    const tabRenamed =
      tabs.find(t => t.id === selectedTabId)?.name !==
      prevTabs?.find(t => t.id === selectedTabId)?.name;
    const penultimateTabDeleted = tabs.length === 1 && prevTabs?.length === 2;

    if (tabSelected || tabRenamed || penultimateTabDeleted) {
      updateURLSlug({
        slug:
          tabs.length <= 1
            ? ""
            : getSlug({
                tabId: selectedTabId,
                name: tabs.find(t => t.id === selectedTabId)?.name,
              }),
        shouldReplace: tabInitialized,
      });
    }
  }, [
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
