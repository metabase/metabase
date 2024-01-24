import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import { BrowseHeaderContent, BrowseHeaderRoot } from "./BrowseHeader.styled";

type Crumb = { to?: string; title?: string };

export const BrowseHeader = ({ crumbs = [] }: { crumbs: Crumb[] }) => {
  return (
    <BrowseHeaderRoot>
      <BrowseHeaderContent>
        <BrowserCrumbs crumbs={crumbs} />
      </BrowseHeaderContent>
    </BrowseHeaderRoot>
  );
};
