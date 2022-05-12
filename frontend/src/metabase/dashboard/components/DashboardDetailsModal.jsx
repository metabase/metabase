/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";
import { t } from "ttag";

import Dashboard from "metabase/entities/dashboards";
import CollapseSection from "metabase/components/CollapseSection";

import { setDashboardAttributes } from "../actions";
import { getDashboardComplete } from "../selectors";

const mapStateToProps = (state, props) => ({
  dashboard: getDashboardComplete(state, props),
});

const mapDispatchToProps = { setDashboardAttributes };

const COLLAPSED_FIELDS = ["cache_ttl"];

class DashboardDetailsModalInner extends React.Component {
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
        form={Dashboard.forms.edit}
        dashboard={dashboard}
        onClose={onClose}
        onSaved={dashboard => {
          const { id, ...attributes } = dashboard;
          // hack: dashboards are stored both in entities.dashboards and dashboard.dashboards
          // calling setDashboardAttributes sync this change made using the entity form into dashboard.dashboards
          setDashboardAttributes({ id, attributes, isDirty: false });
          onChangeLocation(Urls.dashboard(dashboard));
        }}
        overwriteOnInitialValuesChange
        {...props}
      >
        {({ Form, FormField, FormFooter, formFields, onClose }) => {
          const [visibleFields, collapsedFields] = _.partition(
            formFields,
            field => !COLLAPSED_FIELDS.includes(field.name),
          );
          return (
            <Form>
              {visibleFields.map(field => (
                <FormField key={field.name} name={field.name} />
              ))}
              {collapsedFields.length > 0 && (
                <CollapseSection
                  header={t`More options`}
                  iconVariant="up-down"
                  iconPosition="right"
                  headerClass="text-bold text-medium text-brand-hover"
                  bodyClass="pt1"
                >
                  {collapsedFields.map(field => (
                    <FormField key={field.name} name={field.name} />
                  ))}
                </CollapseSection>
              )}
              <FormFooter submitTitle={t`Update`} onCancel={onClose} />
            </Form>
          );
        }}
      </Dashboard.ModalForm>
    );
  }
}

const DashboardDetailsModal = _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardDetailsModalInner);

export default DashboardDetailsModal;
