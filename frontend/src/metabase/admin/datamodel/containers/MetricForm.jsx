import React, { Component } from "react";
import { Link } from "react-router";

import FormLabel from "../components/FormLabel.jsx";
import FormInput from "../components/FormInput.jsx";
import FormTextArea from "../components/FormTextArea.jsx";
import FieldSet from "metabase/components/FieldSet.jsx";
import PartialQueryBuilder from "../components/PartialQueryBuilder.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import { t } from "c-3po";
import { formatValue } from "metabase/lib/formatting";

import { metricFormSelectors } from "../selectors";
import { reduxForm } from "redux-form";

import Query from "metabase/lib/query";

import cx from "classnames";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import Table from "metabase-lib/lib/metadata/Table";

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
      let aggregations =
        values.definition && Query.getAggregations(values.definition);
      if (!aggregations || aggregations.length === 0) {
        errors.definition = t`Aggregation is required`;
      }
      return errors;
    },
  },
  (state, props) => metricFormSelectors(state, props),
)
export default class MetricForm extends Component {
  updatePreviewSummary(datasetQuery) {
    this.props.updatePreviewSummary({
      ...datasetQuery,
      query: {
        aggregation: ["count"],
        ...datasetQuery.query,
      },
    });
  }

  renderActionButtons() {
    const { invalid, handleSubmit, tableMetadata } = this.props;
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
          to={
            "/admin/datamodel/database/" +
            tableMetadata.db_id +
            "/table/" +
            tableMetadata.id
          }
          className="Button ml2"
        >{t`Cancel`}</Link>
      </div>
    );
  }

  render() {
    const {
      fields: { id, name, description, definition, revision_message },
      metric,
      metadata,
      tableMetadata,
      handleSubmit,
      previewSummary,
    } = this.props;

    return (
      <LoadingAndErrorWrapper loading={!tableMetadata}>
        {() => (
          <form className="full" onSubmit={handleSubmit}>
            <div className="wrapper py4">
              <FormLabel
                title={
                  metric && metric.id != null
                    ? t`Edit Your Metric`
                    : t`Create Your Metric`
                }
                description={
                  metric && metric.id != null
                    ? t`Make changes to your metric and leave an explanatory note.`
                    : t`You can create saved metrics to add a named metric option to this table. Saved metrics include the aggregation type, the aggregated field, and optionally any filter you add. As an example, you might use this to create something like the official way of calculating "Average Price" for an Orders table.`
                }
              >
                <PartialQueryBuilder
                  features={{
                    filter: true,
                    aggregation: true,
                  }}
                  metadata={
                    metadata &&
                    tableMetadata &&
                    metadata.tables &&
                    metadata.tables[tableMetadata.id].fields &&
                    Object.assign(new Metadata(), metadata, {
                      tables: {
                        ...metadata.tables,
                        [tableMetadata.id]: Object.assign(
                          new Table(),
                          metadata.tables[tableMetadata.id],
                          {
                            aggregation_options: tableMetadata.aggregation_options.filter(
                              a => a.short !== "rows",
                            ),
                            metrics: [],
                          },
                        ),
                      },
                    })
                  }
                  tableMetadata={tableMetadata}
                  previewSummary={
                    previewSummary == null
                      ? ""
                      : t`Result: ` + formatValue(previewSummary)
                  }
                  updatePreviewSummary={this.updatePreviewSummary.bind(this)}
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
                {id.value != null && (
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

            {id.value == null && (
              <div className="border-top py4">
                <div className="wrapper">{this.renderActionButtons()}</div>
              </div>
            )}
          </form>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
