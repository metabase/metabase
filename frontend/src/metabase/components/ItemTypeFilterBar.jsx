import React from "react";
import { Box } from "grid-styled";
import { t } from "ttag";
import { withRouter } from "react-router";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import colors from "metabase/lib/colors";

export const FILTERS = [
  {
    name: t`Everything`,
    filter: null,
    icon: "list",
  },
  {
    name: t`Metrics`,
    filter: "metric",
    icon: "insight",
  },
  {
    name: t`Segments`,
    filter: "segment",
    icon: "segment",
  },
  {
    name: t`Questions`,
    filter: "card",
    icon: "beaker",
  },
  {
    name: t`Pulses`,
    filter: "pulse",
    icon: "pulse",
  },
];

const ItemTypeFilterBar = props => {
  const { location, analyticsContext } = props;
  return (
    <Box>
      {props.filters.map(f => {
        let isActive = location && location.query.type === f.filter;

        if (!location.query.type && !f.filter) {
          isActive = true;
        }

        const color = isActive ? colors.brand : "inherit";

        return (
          <Link
            to={{
              pathname: location.pathname,
              query: { ...location.query, type: f.filter },
            }}
            color={color}
            hover={{ color: colors.brand }}
            className="flex align-center"
            key={f.filter}
            py={1}
            data-metabase-event={`${analyticsContext};Item Filter;${f.name}`}
          >
            <Icon name={f.icon} size={20} mr={1} />
            <h5
              className="text-uppercase hide sm-show"
              style={{
                color: isActive ? colors.brand : "inherit",
                fontWeight: 900,
              }}
            >
              {f.name}
            </h5>
          </Link>
        );
      })}
    </Box>
  );
};

ItemTypeFilterBar.defaultProps = {
  filters: FILTERS,
};

export default withRouter(ItemTypeFilterBar);
