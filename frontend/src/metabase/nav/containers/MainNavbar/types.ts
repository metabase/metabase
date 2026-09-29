import type { StoreDashboard } from "metabase/redux/store";
import type { Location } from "metabase/router";
import type { IconName, SearchModel } from "metabase-types/api";

export interface MainNavbarOwnProps {
  location: Location;
  params: {
    slug?: string;
    /** The metric routes name their card param `cardId` rather than `slug`. */
    cardId?: string;
    pageId?: string;
  };
  dashboard?: StoreDashboard;
}

export type MainNavbarProps = MainNavbarOwnProps;

/**
 * Which half of the app the main rail is showing: curated content (Library plus official
 * collections) or the user's own creation-oriented nav.
 */
export type NavSection = "official" | "unofficial";

export interface SelectedItem {
  type: "card" | "collection" | "dashboard" | "table" | "non-entity";
  id?: number | string;
  url?: string;
  /** For `card` and `table`, the search model the Official rail keys its rows by. */
  model?: SearchModel;
}

/**
 * An entity the user has opened during this page session. The rail lists them so several things
 * can be open at once and switched between, and closing one keeps the work — it only takes the
 * row out of the list.
 */
export type OpenNavItem = {
  /** `${model}-${id}`, so reopening the same thing replaces its row rather than adding one. */
  key: string;
  name: string;
  url: string;
  icon: IconName;
};
