/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";

import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

export default function BrowseHeader({ crumbs }) {
  return (
    <Box mt={3} mb={2}>
      <Flex align="center" mt={1}>
        <BrowserCrumbs crumbs={crumbs} analyticsContext={ANALYTICS_CONTEXT} />
        <div className="flex flex-align-right">
          <Link
            className="flex flex-align-right"
            to="reference"
            data-metabase-event={`NavBar;Reference`}
          >
            <div className="flex align-center text-medium text-brand-hover">
              <Icon className="flex align-center" size={14} name="reference" />
              <span className="ml1 flex align-center text-bold">
                {t`Learn about our data`}
              </span>
            </div>
          </Link>
        </div>
      </Flex>
    </Box>
  );
}
