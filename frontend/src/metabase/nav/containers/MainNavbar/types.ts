import type { Location } from "history";

import type { Dashboard } from "metabase-types/api";

export interface MainNavbarOwnProps {
  isOpen: boolean;
  location: Location;
  params: {
    slug?: string;
    pageId?: string;
  };
  dashboard?: Dashboard;
}

export interface MainNavbarDispatchProps {
  openNavbar: () => void;
  closeNavbar: () => void;
}

export type MainNavbarProps = MainNavbarOwnProps & MainNavbarDispatchProps;

export interface SelectedItem {
  type: "card" | "collection" | "dashboard" | "non-entity";
  id?: number | string;
  url?: string;
}
