/* eslint-disable react/prop-types */
import { t } from "ttag";

import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import { Icon } from "metabase/ui";
import Link from "metabase/core/components/Link";

import {
  BrowseHeaderContent,
  BrowseHeaderRoot,
  BrowseHeaderIconContainer,
} from "./BrowseHeader.styled";

export default function BrowseHeader({ crumbs = [] }) {
  return (
    <BrowseHeaderRoot>
      <BrowseHeaderContent>
        <BrowserCrumbs crumbs={crumbs} />
        <div className="flex flex-align-right" style={{ flexBasis: "40.0%" }}>
          <Link
            className="flex flex-align-right"
            to="reference"
            data-metabase-event="NavBar;Reference"
          >
            <BrowseHeaderIconContainer>
              <Icon className="flex align-center" size={14} name="reference" />
              <span className="ml1 flex align-center text-bold">
                {t`Learn about our data`}
              </span>
            </BrowseHeaderIconContainer>
          </Link>
        </div>
      </BrowseHeaderContent>
    </BrowseHeaderRoot>
  );
}
