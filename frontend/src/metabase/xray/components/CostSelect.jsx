import React from "react";
import cx from "classnames";
import { Link, withRouter } from "react-router";
import { connect } from "react-redux";
import { getMaxCost } from "metabase/xray/selectors";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import COSTS from "metabase/xray/costs";

const mapStateToProps = state => ({
  maxCost: getMaxCost(state),
});

const getDisabled = maxCost => {
  if (maxCost === "approximate") {
    return ["extended", "exact"];
  } else if (maxCost === "exact") {
    return ["extended"];
  }
  return [];
};

const CostSelect = ({ currentCost, location, maxCost }) => {
  const urlWithoutCost = location.pathname.substr(
    0,
    location.pathname.lastIndexOf("/"),
  );
  return (
    <ol className="bordered rounded shadowed bg-white flex align-center overflow-hidden">
      {Object.keys(COSTS).map(cost => {
        const c = COSTS[cost];
        return (
          <Link
            to={`${urlWithoutCost}/${cost}`}
            className={cx("no-decoration", {
              disabled: getDisabled(maxCost).indexOf(cost) >= 0,
            })}
            key={cost}
          >
            <li
              key={cost}
              className={cx(
                "flex align-center justify-center cursor-pointer bg-brand-hover text-white-hover transition-background transition-text text-grey-2",
                { "bg-brand text-white": currentCost === cost },
              )}
            >
              <Tooltip tooltip={c.description}>
                <Icon size={22} name={c.icon} className="p1 border-right" />
              </Tooltip>
            </li>
          </Link>
        );
      })}
    </ol>
  );
};

export default connect(mapStateToProps)(withRouter(CostSelect));
