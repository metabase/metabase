import { BrowseAppRoot } from "./BrowseApp.styled";

export const BrowseApp = ({ children }: { children: React.ReactNode }) => {
  return <BrowseAppRoot data-testid="browse-data">{children}</BrowseAppRoot>;
};
