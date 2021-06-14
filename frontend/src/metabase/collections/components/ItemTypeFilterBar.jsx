/* eslint-disable react/prop-types */
import React from "react";
import { Flex } from "grid-styled";
import { t } from "ttag";
import { withRouter } from "react-router";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { color } from "metabase/lib/colors";

export const FILTERS = [
  {
    name: t`Everything`,
    filter: null,
    icon: "list",
  },
  {
    name: t`Dashboards`,
    filter: "dashboard",
    icon: "dashboard",
  },
  {
    name: t`Questions`,
    filter: "card",
    icon: "bar",
  },
  {
    name: t`Pulses`,
    filter: "pulse",
    icon: "pulse",
  },
];

const ItemTypeFilterBar = ({
  analyticsContext,
  filters,
  onFilterChange,
  filter,
}) => {
  return (
    <Flex align="center" className="border-bottom mt1">
      {filters.map(f => {
        const isActive = filter === f.filter;

        const linkColor = isActive ? color("brand") : "inherit";

        return (
          <Link
            onClick={() => onFilterChange(f.filter)}
            color={linkColor}
            hover={{ color: color("brand") }}
            className="flex-full flex align-center justify-center sm-block text-brand-hover text-medium"
            mr={[0, 2]}
            key={f.filter}
            py={1}
            data-metabase-event={`${analyticsContext};Item Filter;${f.name}`}
            style={{
              borderBottom: `2px solid ${
                isActive ? color("brand") : "transparent"
              }`,
            }}
          >
            <Icon name={f.icon} className="sm-hide" size={20} />
            <h5
              className="text-uppercase hide sm-show"
              style={{
                color: isActive ? color("brand") : "inherit",
                fontWeight: 900,
              }}
            >
              {f.name}
            </h5>
          </Link>
        );
      })}
    </Flex>
  );
};

ItemTypeFilterBar.defaultProps = {
  filters: FILTERS,
};

export default withRouter(ItemTypeFilterBar);
