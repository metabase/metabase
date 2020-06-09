import React from "react";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "ttag";

import Radio from "metabase/components/Radio";

const DataModelApp = ({ children, onChangeTab, currentTab }) => (
  <div>
    <div className="px3 border-bottom">
      <Radio
        underlined
        value={currentTab}
        options={[
          { name: t`Data`, value: "database" },
          { name: t`Segments`, value: "segments" },
          { name: t`Metrics`, value: "metrics" },
        ]}
        onChange={onChangeTab}
      />
    </div>
    {children}
  </div>
);

const mapDispatchToProps = {
  onChangeTab: tab => push(`/admin/datamodel/${tab}`),
};

export default connect(
  state => ({ currentTab: "database" }),
  mapDispatchToProps,
)(DataModelApp);
