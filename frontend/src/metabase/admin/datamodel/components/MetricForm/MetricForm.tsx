import React from "react";
import { Formik } from "formik";
import type { FormikErrors } from "formik";
import { t } from "ttag";
import { formatValue } from "metabase/lib/formatting";
import Button from "metabase/core/components/Button";
import FieldSet from "metabase/components/FieldSet";
import { Metric } from "metabase-types/api";
import FormLabel from "../FormLabel/FormLabel";
import FormInput from "../FormInput/FormInput";
import FormTextArea from "../FormTextArea/FormTextArea";
import PartialQueryBuilder from "../PartialQueryBuilder";
import {
  FormRoot,
  FormSection,
  FormBodyContent,
  FormBody,
  FormFooter,
  FormFooterContent,
} from "./MetricForm.styled";

export interface MetricFormProps {
  metric?: Metric;
  previewSummary?: string;
  updatePreviewSummary: (previewSummary: string) => void;
  onSubmit: (values: Partial<Metric>) => void;
}

const MetricForm = ({
  metric,
  previewSummary,
  updatePreviewSummary,
  onSubmit,
}: MetricFormProps): JSX.Element => {
  const isNew = metric == null;
  const previewValue = previewSummary
    ? t`Result: ${formatValue(previewSummary)}`
    : "";

  return (
    <Formik
      initialValues={metric ?? {}}
      validate={validate}
      onSubmit={onSubmit}
    >
      {({ isValid, handleSubmit }) => (
        <FormRoot onSubmit={handleSubmit}>
          <FormBody>
            <FormBodyContent>
              <FormLabel
                title={isNew ? t`Create Your Metric` : t`Edit Your Metric`}
                description={
                  isNew
                    ? t`You can create saved metrics to add a named metric option. Saved metrics include the aggregation type, the aggregated field, and optionally any filter you add. As an example, you might use this to create something like the official way of calculating "Average Price" for an Orders table.`
                    : t`Make changes to your metric and leave an explanatory note.`
                }
              >
                <PartialQueryBuilder
                  features={{
                    filter: true,
                    aggregation: true,
                  }}
                  previewSummary={previewValue}
                  updatePreviewSummary={updatePreviewSummary}
                  canChangeTable={isNew}
                />
              </FormLabel>
              <FormLabel
                title={t`Name Your Metric`}
                description={t`Give your metric a name to help others find it.`}
              >
                <FormInput
                  name="name"
                  placeholder={t`Something descriptive but not too long`}
                />
              </FormLabel>
              <FormLabel
                title={t`Describe Your Metric`}
                description={t`Give your metric a description to help others understand what it's about.`}
              >
                <FormTextArea
                  name="description"
                  placeholder={t`This is a good place to be more specific about less obvious metric rules`}
                />
              </FormLabel>
              {!isNew && (
                <FieldSet legend={t`Reason For Changes`} noPadding={false}>
                  <FormLabel
                    description={t`Leave a note to explain what changes you made and why they were required.`}
                  >
                    <FormTextArea
                      name="revision_message"
                      placeholder={t`This will show up in the revision history for this metric to help everyone remember why things changed`}
                    />
                  </FormLabel>
                  <FormFooterContent>
                    <MetricFormActions isValid={isValid} />
                  </FormFooterContent>
                </FieldSet>
              )}
            </FormBodyContent>
          </FormBody>
          {isNew && (
            <FormFooter>
              <FormSection>
                <MetricFormActions isValid={isValid} />
              </FormSection>
            </FormFooter>
          )}
        </FormRoot>
      )}
    </Formik>
  );
};

interface MetricFormActionsProps {
  isValid: boolean;
}

const MetricFormActions = ({
  isValid,
}: MetricFormActionsProps): JSX.Element => {
  return (
    <div>
      <Button type="submit" primary={isValid} disabled={!isValid}>
        {t`Save changes`}
      </Button>
    </div>
  );
};

const validate = (values: Partial<Metric>) => {
  const errors: FormikErrors<Metric> = {};

  if (!values.name) {
    errors.name = t`Name is required`;
  }

  if (!values.description) {
    errors.description = t`Description is required`;
  }

  if (values.id != null && !values.revision_message) {
    errors.revision_message = t`Revision message is required`;
  }

  return errors;
};

export default MetricForm;
