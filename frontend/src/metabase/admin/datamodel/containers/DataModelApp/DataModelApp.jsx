import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "ttag";

import Radio from "metabase/components/Radio";

const propTypes = {
  onChangeTab: PropTypes.func.isRequired,
  location: PropTypes.shape({
    pathname: PropTypes.string.isRequired,
  }).isRequired,
  children: PropTypes.node.isRequired,
};

const mapDispatchToProps = {
  onChangeTab: tab => push(`/admin/datamodel/${tab}`),
};

const TAB = {
  SEGMENTS: "segments",
  METRICS: "metrics",
  DATABASE: "database",
};

function DataModelApp({ children, onChangeTab, location: { pathname } }) {
  const currentTab = useMemo(() => {
    if (/\/segments?/.test(pathname)) {
      return TAB.SEGMENTS;
    }
    if (/\/metrics?/.test(pathname)) {
      return TAB.METRICS;
    }
    return TAB.DATABASE;
  }, [pathname]);

  return (
    <div>
      <div className="px3 border-bottom">
        <Radio
          value={currentTab}
          options={[
            { name: t`Data`, value: TAB.DATABASE },
            { name: t`Segments`, value: TAB.SEGMENTS },
            { name: t`Metrics`, value: TAB.METRICS },
          ]}
          onChange={onChangeTab}
          variant="underlined"
        />
      </div>
      {children}
    </div>
  );
}

DataModelApp.propTypes = propTypes;

export default connect(null, mapDispatchToProps)(DataModelApp);
