/* eslint-disable react/prop-types */
import { BrowseAppRoot } from "./BrowseApp.styled";

export default function BrowseApp({ children }) {
  return <BrowseAppRoot data-testid="browse-data">{children}</BrowseAppRoot>;
}
