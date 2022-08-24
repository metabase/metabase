import { Location, LocationDescriptor } from "history";

export interface MainNavbarProps {
  isOpen: boolean;
  location: Location;
  params: {
    slug?: string;
  };
  openNavbar: () => void;
  closeNavbar: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

export interface SelectedItem {
  type: "card" | "collection" | "dashboard" | "data-app" | "non-entity";
  id?: number | string;
  url?: string;
}
