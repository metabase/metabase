import type { Location } from "history";

export interface MainNavbarOwnProps {
  isOpen: boolean;
  location: Location;
  params: {
    slug?: string;
    pageId?: string;
  };
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
