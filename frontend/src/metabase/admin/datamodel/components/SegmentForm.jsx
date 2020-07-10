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

import cx from "classnames";

@reduxForm(
  {
    form: "segment",
    fields: [
      "id",
      "name",
      "description",
      "table_id",
      "definition",
      "revision_message",
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
      if (
        !values.definition ||
        !values.definition.filter ||
        values.definition.filter.length < 1
      ) {
        errors.definition = t`At least one filter is required`;
      }
      return errors;
    },
    initialValues: {
      name: "",
      description: "",
      table_id: null,
      definition: { filter: [] },
      revision_message: null,
    },
  },
  (state, { segment }) => ({ initialValues: segment }),
)
export default class SegmentForm extends Component {
  updatePreviewSummary(datasetQuery) {
    this.props.updatePreviewSummary({
      ...datasetQuery,
      query: {
        ...datasetQuery.query,
        aggregation: [["count"]],
      },
    });
  }

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
          to={`/admin/datamodel/segments`}
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
    } = this.props;

    const isNewRecord = id.value === "";

    return (
      <form className="full" onSubmit={handleSubmit}>
        <div className="wrapper py4">
          <FormLabel
            title={isNewRecord ? t`Create Your Segment` : t`Edit Your Segment`}
            description={
              isNewRecord
                ? t`Select and add filters to create your new segment.`
                : t`Make changes to your segment and leave an explanatory note.`
            }
          >
            <PartialQueryBuilder
              features={{
                filter: true,
              }}
              previewSummary={
                previewSummary == null
                  ? ""
                  : formatValue(previewSummary) + " rows"
              }
              updatePreviewSummary={this.updatePreviewSummary.bind(this)}
              canChangeTable={isNewRecord}
              {...definition}
            />
          </FormLabel>
          <div style={{ maxWidth: "575px" }}>
            <FormLabel
              title={t`Name Your Segment`}
              description={t`Give your segment a name to help others find it.`}
            >
              <FormInput
                field={name}
                placeholder={t`Something descriptive but not too long`}
              />
            </FormLabel>
            <FormLabel
              title={t`Describe Your Segment`}
              description={t`Give your segment a description to help others understand what it's about.`}
            >
              <FormTextArea
                field={description}
                placeholder={t`This is a good place to be more specific about less obvious segment rules`}
              />
            </FormLabel>
            {!isNewRecord && (
              <FieldSet legend={t`Reason For Changes`}>
                <FormLabel
                  description={t`Leave a note to explain what changes you made and why they were required.`}
                >
                  <FormTextArea
                    field={revision_message}
                    placeholder={t`This will show up in the revision history for this segment to help everyone remember why things changed`}
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
