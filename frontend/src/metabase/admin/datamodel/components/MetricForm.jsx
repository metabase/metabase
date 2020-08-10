import React, { Component } from "react";
import { Link } from "react-router";
import { reduxForm } from "redux-form";
import cx from "classnames";

import FormLabel from "../components/FormLabel";
import FormInput from "../components/FormInput";
import FormTextArea from "../components/FormTextArea";
import FieldSet from "metabase/components/FieldSet";
import PartialQueryBuilder from "../components/PartialQueryBuilder";
import { t } from "ttag";
import { formatValue } from "metabase/lib/formatting";

import * as Q from "metabase/lib/query/query";

@reduxForm(
  {
    form: "metric",
    fields: [
      "id",
      "name",
      "description",
      "table_id",
      "definition",
      "revision_message",
      "show_in_getting_started",
    ],
    validate: values => {
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
    },
  },
  (state, { metric }) => ({ initialValues: metric }),
)
export default class MetricForm extends Component {
  renderActionButtons() {
    const { invalid, handleSubmit } = this.props;
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

  render() {
    const {
      fields: { id, name, description, definition, revision_message },
      handleSubmit,
      previewSummary,
      updatePreviewSummary,
    } = this.props;

    const isNewRecord = id.value === "";

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
              {...definition}
            />
          </FormLabel>
          <div style={{ maxWidth: "575px" }}>
            <FormLabel
              title={t`Name Your Metric`}
              description={t`Give your metric a name to help others find it.`}
            >
              <FormInput
                field={name}
                placeholder={t`Something descriptive but not too long`}
              />
            </FormLabel>
            <FormLabel
              title={t`Describe Your Metric`}
              description={t`Give your metric a description to help others understand what it's about.`}
            >
              <FormTextArea
                field={description}
                placeholder={t`This is a good place to be more specific about less obvious metric rules`}
              />
            </FormLabel>
            {!isNewRecord && (
              <FieldSet legend={t`Reason For Changes`}>
                <FormLabel
                  description={t`Leave a note to explain what changes you made and why they were required.`}
                >
                  <FormTextArea
                    field={revision_message}
                    placeholder={t`This will show up in the revision history for this metric to help everyone remember why things changed`}
                  />
                </FormLabel>
                <div className="flex align-center">
                  {this.renderActionButtons()}
                </div>
              </FieldSet>
            )}
          </div>
        </div>

        {isNewRecord && (
          <div className="border-top py4">
            <div className="wrapper">{this.renderActionButtons()}</div>
          </div>
        )}
      </form>
    );
  }
}
