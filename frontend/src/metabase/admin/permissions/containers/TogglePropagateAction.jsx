import React from "react";

import { connect } from "react-redux";

import { t } from "c-3po";

import { getPropagatePermissions } from "../selectors";
import { setPropagatePermissions } from "../permissions";

import Toggle from "metabase/components/Toggle";

const mapStateToProps = (state, props) => ({
  propagate: getPropagatePermissions(state, props),
});
const mapDispatchToProps = {
  setPropagatePermissions,
};

const TogglePropagateAction = connect(mapStateToProps, mapDispatchToProps)(
  ({ propagate, setPropagatePermissions }) => (
    <div
      className="flex align-center bg-medium p1 cursor-pointer"
      onClick={() => setPropagatePermissions(!propagate)}
    >
      <Toggle small value={propagate} />
      <span className="ml1 text-bold text-small">{t`Also change sub-collections`}</span>
    </div>
  ),
);

// eslint-disable-next-line react/display-name
export default () => <TogglePropagateAction />;
