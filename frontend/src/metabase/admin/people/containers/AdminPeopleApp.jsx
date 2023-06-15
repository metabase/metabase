/* eslint "react/prop-types": "warn" */
import { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import _ from "underscore";
import { connect } from "react-redux";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import NudgeToPro from "metabase/admin/people/components/NudgeToPro";

import AdminLayout from "metabase/components/AdminLayout";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";

class AdminPeopleApp extends Component {
  static propTypes = {
    children: PropTypes.any,
    shouldNudge: PropTypes.bool,
  };

  render() {
    const { children, shouldNudge } = this.props;
    const sidebar = (
      <LeftNavPane fullHeight={!shouldNudge}>
        <LeftNavPaneItem name={t`People`} path="/admin/people" index />
        <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />
      </LeftNavPane>
    );
    return (
      <AdminLayout
        sidebar={
          !shouldNudge ? (
            sidebar
          ) : (
            <div className="flex flex-column">
              {sidebar}
              <NudgeToPro />
            </div>
          )
        }
      >
        {children}
      </AdminLayout>
    );
  }
}

// selectors:
const mapStateToProps = state => ({
  shouldNudge: shouldNudgeToPro(state),
});

export default _.compose(connect(mapStateToProps))(AdminPeopleApp);
