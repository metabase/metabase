import React from "react";

import { connect } from "react-redux";

import { t } from "ttag";

import { getPropagatePermissions } from "../selectors";
import { setPropagatePermissions } from "../permissions";

import Toggle from "metabase/components/Toggle";

const mapStateToProps = (state, props) => ({
  propagate: getPropagatePermissions(state, props),
});
const mapDispatchToProps = {
  setPropagatePermissions,
};

const TogglePropagateAction = connect(
  mapStateToProps,
  mapDispatchToProps,
)(({ propagate, setPropagatePermissions }) => (
  <div
    className="flex align-center bg-medium px2 py1 cursor-pointer"
    onClick={() => setPropagatePermissions(!propagate)}
  >
    <span className="mr2 text-small">{t`Also change sub-collections`}</span>
    <Toggle small value={propagate} />
  </div>
));

// eslint-disable-next-line react/display-name
export default () => <TogglePropagateAction />;
