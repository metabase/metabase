/* eslint-disable react/prop-types */
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import { BrowseHeaderContent, BrowseHeaderRoot } from "./BrowseHeader.styled";

export default function BrowseHeader({ crumbs }) {
  return (
    <BrowseHeaderRoot>
      <BrowseHeaderContent>
        <BrowserCrumbs crumbs={crumbs} analyticsContext={ANALYTICS_CONTEXT} />
      </BrowseHeaderContent>
    </BrowseHeaderRoot>
  );
}
