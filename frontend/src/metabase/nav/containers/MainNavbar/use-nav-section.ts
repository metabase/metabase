import { useCallback, useEffect } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { setNavSection } from "metabase/redux/app";
import { useLocation } from "metabase/router";
import { getNavSectionOverride } from "metabase/selectors/app";

import type { NavSection } from "./types";

const DEFAULT_PATHS: Record<NavSection, string> = {
  official: "/browse/models",
  unofficial: "/",
};

/**
 * Module-scoped rather than stored: switching back to a section should return you to what you were
 * looking at for the life of the page, and reset on reload.
 */
const lastPath: Record<NavSection, string> = { ...DEFAULT_PATHS };

type UseNavSection = {
  section: NavSection;
  setSection: (section: NavSection) => void;
  hrefFor: (section: NavSection) => string;
};

/**
 * Which half of the app the rail is showing. Deliberately not derived from the URL: Official rows
 * link to /metric/…, /model/… and /question/…, so a URL-derived section would flip to Unofficial
 * the moment you opened anything out of the Official tree. The URL only seeds the section for a
 * deep link, until the switcher is used.
 */
export function useNavSection(): UseNavSection {
  const dispatch = useDispatch();
  const override = useSelector(getNavSectionOverride);
  const { pathname } = useLocation();
  const section =
    override ?? (pathname.startsWith("/browse") ? "official" : "unofficial");

  useEffect(() => {
    lastPath[section] = pathname;
  }, [section, pathname]);

  const setSection = useCallback(
    (next: NavSection) => {
      dispatch(setNavSection(next));
    },
    [dispatch],
  );

  const hrefFor = useCallback(
    (target: NavSection) => (target === section ? pathname : lastPath[target]),
    [section, pathname],
  );

  return { section, setSection, hrefFor };
}
