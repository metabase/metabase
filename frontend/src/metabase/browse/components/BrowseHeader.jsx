/* eslint-disable react/prop-types */
import { t } from "ttag";

import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import { Icon } from "metabase/ui";
import Link from "metabase/core/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import {
  BrowseHeaderContent,
  BrowseHeaderRoot,
  BrowserHeaderIconContainer,
} from "./BrowseHeader.styled";

export default function BrowseHeader({ crumbs = [] }) {
  return (
    <BrowseHeaderRoot>
      <BrowseHeaderContent>
        {crumbs.length > 0 ? (
          <BrowserCrumbs crumbs={crumbs} analyticsContext={ANALYTICS_CONTEXT} />
        ) : (
          <h2 className="text-dark">{t`Browse data`}</h2>
        )}
        <div className="flex flex-align-right" style={{ flexBasis: "40.0%" }}>
          <Link
            className="flex flex-align-right"
            to="reference"
            data-metabase-event="NavBar;Reference"
          >
            <BrowserHeaderIconContainer>
              <Icon className="flex align-center" size={14} name="reference" />
              <span className="ml1 flex align-center text-bold">
                {t`Learn about our data`}
              </span>
            </BrowserHeaderIconContainer>
          </Link>
        </div>
      </BrowseHeaderContent>
    </BrowseHeaderRoot>
  );
}
