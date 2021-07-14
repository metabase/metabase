import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";

import { Link } from "react-router";
import { reduxForm, Field } from "redux-form";
import cx from "classnames";

import FormLabel from "../components/FormLabel";
import FormInput from "../components/FormInput";
import FormTextArea from "../components/FormTextArea";
import FieldSet from "metabase/components/FieldSet";
import PartialQueryBuilder from "../components/PartialQueryBuilder";
import { t } from "ttag";
import { formatValue } from "metabase/lib/formatting";

import * as Q from "metabase/lib/query/query";

export default _.compose(
  connect((state, { metric }) => ({ initialValues: metric })),
  reduxForm({
    form: "metricForm",
    validate,
  }),
)(MetricForm);

MetricForm.propTypes = {
  metric: PropTypes.object,
  handleSubmit: PropTypes.func,
  previewSummary: PropTypes.object,
  updatePreviewSummary: PropTypes.func,
  invalid: PropTypes.bool,
};

function MetricForm({
  metric,
  previewSummary,
  updatePreviewSummary,
  invalid,
  handleSubmit,
}) {
  const isNewRecord = !metric || metric.id == null;

  const renderParitialQueryBuilder = React.useCallback(
    field => {
      return (
        <PartialQueryBuilder
          features={{
            filter: true,
            aggregation: true,
          }}
          previewSummary={
            previewSummary == null
              ? ""
              : t`Result: ` + formatValue(previewSummary)
          }
          updatePreviewSummary={updatePreviewSummary}
          canChangeTable={isNewRecord}
          value={
            field.input.value || null /* defaultValue doesn't seem to work? */
          }
          onChange={field.input.onChange}
          field={field}
        />
      );
    },
    [isNewRecord, previewSummary, updatePreviewSummary],
  );

  return (
    <form className="full" onSubmit={handleSubmit}>
      <div className="wrapper py4">
        <FormLabel
          title={isNewRecord ? t`Create Your Metric` : t`Edit Your Metric`}
          description={
            isNewRecord
              ? t`You can create saved metrics to add a named metric option. Saved metrics include the aggregation type, the aggregated field, and optionally any filter you add. As an example, you might use this to create something like the official way of calculating "Average Price" for an Orders table.`
              : t`Make changes to your metric and leave an explanatory note.`
          }
        >
          <Field
            name="definition"
            defaultValue={null}
            component={renderParitialQueryBuilder}
          />
        </FormLabel>
        <div style={{ maxWidth: "575px" }}>
          <FormLabel
            title={t`Name Your Metric`}
            description={t`Give your metric a name to help others find it.`}
          >
            <Field
              name="name"
              component={FormInput}
              placeholder={t`Something descriptive but not too long`}
            />
          </FormLabel>
          <FormLabel
            title={t`Describe Your Metric`}
            description={t`Give your metric a description to help others understand what it's about.`}
          >
            <Field
              name="description"
              component={FormTextArea}
              placeholder={t`This is a good place to be more specific about less obvious metric rules`}
            />
          </FormLabel>
          {!isNewRecord && (
            <FieldSet legend={t`Reason For Changes`}>
              <FormLabel
                description={t`Leave a note to explain what changes you made and why they were required.`}
              >
                <Field
                  name="revision_message"
                  component={FormTextArea}
                  placeholder={t`This will show up in the revision history for this metric to help everyone remember why things changed`}
                />
              </FormLabel>
              <div className="flex align-center">
                {renderActionButtons(invalid, handleSubmit)}
              </div>
            </FieldSet>
          )}
        </div>
      </div>

      {isNewRecord && (
        <div className="border-top py4">
          <div className="wrapper">
            {renderActionButtons(invalid, handleSubmit)}
          </div>
        </div>
      )}
    </form>
  );
}

function renderActionButtons(invalid, handleSubmit) {
  return (
    <div>
      <button
        className={cx("Button", {
          "Button--primary": !invalid,
          disabled: invalid,
        })}
        onClick={handleSubmit}
      >{t`Save changes`}</button>
      <Link
        to={`/admin/datamodel/metrics`}
        className="Button ml2"
      >{t`Cancel`}</Link>
    </div>
  );
}

function validate(values) {
  const errors = {};
  if (!values.name) {
    errors.name = t`Name is required`;
  }
  if (!values.description) {
    errors.description = t`Description is required`;
  }
  if (values.id != null) {
    if (!values.revision_message) {
      errors.revision_message = t`Revision message is required`;
    }
  }
  const aggregations =
    values.definition && Q.getAggregations(values.definition);
  if (!aggregations || aggregations.length === 0) {
    errors.definition = t`Aggregation is required`;
  }
  return errors;
}
