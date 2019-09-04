import React, { Component } from "react";
import { Link } from "react-router";

import FormLabel from "../components/FormLabel";
import FormInput from "../components/FormInput";
import FormTextArea from "../components/FormTextArea";
import FieldSet from "metabase/components/FieldSet";
import PartialQueryBuilder from "../components/PartialQueryBuilder";
import { t } from "ttag";
import { formatValue } from "metabase/lib/formatting";

import { reduxForm } from "redux-form";

import * as Q_DEPRECATED from "metabase/lib/query";

import cx from "classnames";
import Question from "metabase-lib/lib/Question";
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
      const aggregations =
        values.definition && Q_DEPRECATED.getAggregations(values.definition);
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
    const {
      invalid,
      handleSubmit,
      table: { db_id: databaseId, id: tableId },
    } = this.props;
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
          to={`/admin/datamodel/database/${databaseId}/table/${tableId}`}
          className="Button ml2"
        >{t`Cancel`}</Link>
      </div>
    );
  }

  componentDidMount() {
    if (!this.props.fields.definition.value) {
      this.setDefaultQuery();
    }
  }
  componentDidUpdate() {
    if (!this.props.fields.definition.value) {
      this.setDefaultQuery();
    }
  }

  setDefaultQuery() {
    const {
      fields: {
        definition: { onChange },
      },
      metadata,
      table: { id: tableId, db_id: databaseId },
      updatePreviewSummary,
    } = this.props;

    if (!metadata) {
      // we need metadata to generate a default question
      return;
    }

    const query = Question.create({ databaseId, tableId, metadata }).query();
    const table = query.table();
    let queryWithFilters;
    if (table.entity_type === "entity/GoogleAnalyticsTable") {
      const dateField = table.fields.find(f => f.name === "ga:date");
      if (dateField) {
        queryWithFilters = query
          .addFilter(["time-interval", ["field-id", dateField.id], -365, "day"])
          .addAggregation(["metric", "ga:users"]);
      }
    } else {
      queryWithFilters = query.addAggregation(["count"]);
    }

    if (queryWithFilters) {
      onChange(queryWithFilters.query());
      updatePreviewSummary(queryWithFilters.datasetQuery());
    }
  }

  render() {
    const {
      fields: { id, name, description, definition, revision_message },
      metadata,
      table,
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
                ? t`You can create saved metrics to add a named metric option to this table. Saved metrics include the aggregation type, the aggregated field, and optionally any filter you add. As an example, you might use this to create something like the official way of calculating "Average Price" for an Orders table.`
                : t`Make changes to your metric and leave an explanatory note.`
            }
          >
            {metadata && table && (
              <PartialQueryBuilder
                features={{
                  filter: true,
                  aggregation: true,
                }}
                metadata={
                  metadata.tables &&
                  metadata.tables[table.id].fields &&
                  Object.assign(new Metadata(), metadata, {
                    tables: {
                      ...metadata.tables,
                      [table.id]: Object.assign(
                        new Table(),
                        metadata.tables[table.id],
                        {
                          aggregation_options: (
                            table.aggregation_options || []
                          ).filter(a => a.short !== "rows"),
                          metrics: (table.metrics || []).filter(
                            m => m.googleAnalyics,
                          ),
                        },
                      ),
                    },
                  })
                }
                tableMetadata={table}
                previewSummary={
                  previewSummary == null
                    ? ""
                    : t`Result: ` + formatValue(previewSummary)
                }
                updatePreviewSummary={updatePreviewSummary}
                {...definition}
              />
            )}
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
