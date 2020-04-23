import React from "react";
import { Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { color } from "metabase/lib/colors";

// TODO: merge with Breadcrumbs

const Crumb = ({ children }) => (
  <h5 className="text-uppercase text-medium" style={{ fontWeight: 900 }}>
    {children}
  </h5>
);

const BrowserCrumbs = ({ crumbs, analyticsContext }) => (
  <Flex align="center">
    {crumbs
      .filter(c => c)
      .map((crumb, index, crumbs) => [
        <Flex align="center">
          {crumb.to ? (
            <Link
              className="text-brand-hover cursor-pointer"
              key={"title" + index}
              to={crumb.to}
              data-metabase-event={`${analyticsContext};Bread Crumb;Click`}
            >
              <Crumb>{crumb.title}</Crumb>
            </Link>
          ) : (
            <Crumb key={"title" + index}>{crumb.title}</Crumb>
          )}
          {index < crumbs.length - 1 ? (
            <Icon
              key={"divider" + index}
              name="chevronright"
              color={color("text-light")}
              mx={1}
            />
          ) : null}
        </Flex>,
      ])}
  </Flex>
);

export default BrowserCrumbs;
