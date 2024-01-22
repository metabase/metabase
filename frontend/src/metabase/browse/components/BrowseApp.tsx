import { BrowseDataPage, type BrowseTabId } from "../containers/BrowseData";
import { BrowseAppRoot } from "./BrowseApp.styled";

export const BrowseApp = ({
  tab,
  children,
}: {
  tab: BrowseTabId;
  children: React.ReactNode;
}) => {
  children ||= <BrowseDataPage tab={tab} />;
  return <BrowseAppRoot data-testid="browse-data">{children}</BrowseAppRoot>;
};
