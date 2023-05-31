/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import { BrowseHeaderContent, BrowseHeaderRoot } from "./BrowseHeader.styled";

export default function BrowseHeader({ crumbs }) {
  return (
    <BrowseHeaderRoot>
      <BrowseHeaderContent>
        <BrowserCrumbs crumbs={crumbs} analyticsContext={ANALYTICS_CONTEXT} />
        <div className="flex flex-align-right">
          <Link
            className="flex flex-align-right"
            to="reference"
            data-metabase-event="NavBar;Reference"
          >
            <div className="flex align-center text-medium text-brand-hover">
              <Icon className="flex align-center" name="reference" />
              <span className="ml1 flex align-center text-bold">
                {t`Learn about our data`}
              </span>
            </div>
          </Link>
        </div>
      </BrowseHeaderContent>
    </BrowseHeaderRoot>
  );
}
