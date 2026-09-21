import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { setNavSection } from "metabase/redux/app";
import { useLocation } from "metabase/router";
import { getNavSectionOverride } from "metabase/selectors/app";

import type { NavSection } from "./types";

type UseNavSection = {
  section: NavSection;
  setSection: (section: NavSection) => void;
};

/**
 * Which half of the app the rail is showing. Purely a view state: switching sections re-renders the
 * rail and never navigates, so whatever you were looking at stays open.
 *
 * Deliberately not derived from the URL either. Official rows link to /metric/…, /model/… and
 * /question/…, so a URL-derived section would flip to Unofficial the moment you opened anything out
 * of the Official tree. The URL only seeds the section for a deep link, until the switcher is used.
 */
export function useNavSection(): UseNavSection {
  const dispatch = useDispatch();
  const override = useSelector(getNavSectionOverride);
  const { pathname } = useLocation();
  const section =
    override ?? (pathname.startsWith("/browse") ? "official" : "unofficial");

  const setSection = useCallback(
    (next: NavSection) => {
      dispatch(setNavSection(next));
    },
    [dispatch],
  );

  return { section, setSection };
}
