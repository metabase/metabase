/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { t } from "ttag";

import Dashboard from "metabase/entities/dashboards";
import CollapseSection from "metabase/components/CollapseSection";

import { setDashboardAttributes } from "../actions";
import { getDashboardComplete } from "../selectors";

import { CacheTTLFieldContainer } from "./DashboardDetailsModal.styled";

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
        form={Dashboard.forms.edit}
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
        {({ Form, FormField, FormFooter, formFields, onClose }) => {
          const visibleFields = formFields.filter(
            field => field.name !== "cache_ttl",
          );
          const hasCacheTTLField = visibleFields.length !== formFields.length;
          return (
            <Form>
              {visibleFields.map(field => (
                <FormField key={field.name} name={field.name} />
              ))}
              {hasCacheTTLField && (
                <CollapseSection
                  header={t`More options`}
                  iconVariant="up-down"
                  iconPosition="right"
                >
                  <CacheTTLField>
                    <FormField name="cache_ttl" hasMargin={false} />
                  </CacheTTLField>
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

function CacheTTLField({ children }) {
  return (
    <CacheTTLFieldContainer>
      <span>{t`Cache all question results for`}</span>
      {children}
      <span>{t`hours`}</span>
    </CacheTTLFieldContainer>
  );
}

export default DashboardDetailsModal;
