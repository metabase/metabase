import { Location, LocationDescriptor } from "history";

export interface MainNavbarOwnProps {
  isOpen: boolean;
  location: Location;
  params: {
    slug?: string;
  };
}

export interface MainNavbarDispatchProps {
  openNavbar: () => void;
  closeNavbar: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

export type MainNavbarProps = MainNavbarOwnProps & MainNavbarDispatchProps;

export interface SelectedItem {
  type: "card" | "collection" | "dashboard" | "data-app" | "non-entity";
  id?: number | string;
  url?: string;
}
