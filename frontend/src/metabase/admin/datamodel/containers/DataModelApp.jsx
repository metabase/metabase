import React from "react";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "ttag";

import Radio from "metabase/components/Radio";

const mapDispatchToProps = {
  onChangeTab: tab => push(`/admin/datamodel/${tab}`),
};

@connect(
  null,
  mapDispatchToProps,
)
export default class DataModelApp extends React.Component {
  render() {
    const { children, onChangeTab, location } = this.props;
    return (
      <div>
        <div className="px3 border-bottom">
          <Radio
            underlined
            value={location.pathname.split("/")[3]}
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
  }
}
