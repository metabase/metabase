/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { t } from "ttag";

import Dashboard from "metabase/entities/dashboards";

import { setDashboardAttributes } from "../actions";
import { getDashboardComplete } from "../selectors";

const mapStateToProps = (state, props) => ({
  dashboard: getDashboardComplete(state, props),
});

const mapDispatchToProps = { setDashboardAttributes };

@withRouter
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
class DashboardDetailsModal extends React.Component {
  render() {
    const {
      onClose,
      onChangeLocation,
      setDashboardAttributes,
      dashboard,
      ...props
    } = this.props;
    return (
      <Dashboard.ModalForm
        title={t`Edit dashboard details`}
        dashboard={dashboard}
        onClose={onClose}
        onSaved={dashboard => {
          const { id, ...attributes } = dashboard;
          // hack: dashboards are stored both in entities.dashboards and dashboard.dashboards
          // calling setDashboardAttributes sync this change made using the entity form into dashboard.dashboards
          setDashboardAttributes({ id, attributes });
          onChangeLocation(Urls.dashboard(dashboard));
        }}
        overwriteOnInitialValuesChange
        {...props}
      >
        {({ Form, FormField, FormFooter, onClose, ...rest }) => (
          <Form>
            <FormField name="name" />
            <FormField name="description" />
            <FormField name="collection_id" />
            <FormFooter submitTitle={t`Update`} onCancel={onClose} />
          </Form>
        )}
      </Dashboard.ModalForm>
    );
  }
}

export default DashboardDetailsModal;
