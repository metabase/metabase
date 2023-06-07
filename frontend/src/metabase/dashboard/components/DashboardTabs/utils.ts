import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { SelectedTabId } from "metabase-types/store";

export function getSlug({
  tabId,
  name,
}: {
  tabId: SelectedTabId;
  name: string;
}) {
  if (tabId === null || tabId < 0) {
    return "";
  }
  return [tabId, ...name.toLowerCase().split(" ")].join("-");
}

function getPathnameBeforeSlug() {
  const match = window.location.pathname.match(/(.*\/dashboard\/[^\/]*)\/?/);
  if (match === null) {
    throw Error("No match with pathname before dashboard tab slug.");
  }
  return match[1];
}

export function useUpdateURLSlug() {
  const dispatch = useDispatch();

  return {
    updateURLSlug: (slug: string) => {
      const pathname = slug
        ? `${getPathnameBeforeSlug()}/${slug}`
        : getPathnameBeforeSlug();

      dispatch(replace({ pathname }));
    },
  };
}
