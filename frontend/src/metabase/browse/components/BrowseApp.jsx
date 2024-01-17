/* eslint-disable react/prop-types */
import { BrowseAppRoot } from "./BrowseApp.styled";

export default function BrowseApp({ children }) {
  return (
    <BrowseAppRoot
      data-testid="browse-data"
      style={{ height: "100%", padding: "1rem" }}
    >
      {children}
    </BrowseAppRoot>
  );
}
