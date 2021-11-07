import React, { Fragment } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import { ANALYTICS_CONTEXT } from "../../constants";

const itemButtonsPropTypes = {
  tableId: PropTypes.number,
  databaseId: PropTypes.number,
  xraysEnabled: PropTypes.bool,
};

const TableBrowserItemButtons = ({ tableId, databaseId, xraysEnabled }) => {
  return (
    <Fragment>
      {xraysEnabled && (
        <Link
          to={`/auto/dashboard/table/${tableId}`}
          data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;X-ray Click`}
          className="link--icon ml1"
        >
          <Icon
            name="bolt"
            tooltip={t`X-ray this table`}
            color={color("warning")}
            size={20}
            className="hover-child"
          />
        </Link>
      )}
      <Link
        to={`/reference/databases/${databaseId}/tables/${tableId}`}
        data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;Reference Click`}
        className="link--icon ml1"
      >
        <Icon
          name="reference"
          tooltip={t`Learn about this table`}
          color={color("text-medium")}
          className="hover-child"
        />
      </Link>
    </Fragment>
  );
};

TableBrowserItemButtons.propTypes = itemButtonsPropTypes;
