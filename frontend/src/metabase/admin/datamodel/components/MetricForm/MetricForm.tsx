import React, { ReactNode } from "react";
import { Link } from "react-router";
import { Field, Formik } from "formik";
import type { FieldProps } from "formik";
import { t } from "ttag";
import * as Q from "metabase/lib/query/query";
import { formatValue } from "metabase/lib/formatting";
import Button from "metabase/core/components/Button";
import FieldSet from "metabase/components/FieldSet";
import { Metric } from "metabase-types/api";
import PartialQueryBuilder from "../PartialQueryBuilder";
import {
  FormRoot,
  FormSection,
  FormBody,
  FormBodyContent,
  FormFooter,
  FormFooterContent,
  FormSubmitButton,
  FormInputRoot,
  FormLabelRoot,
  FormLabelContent,
  FormLabelTitle,
  FormLabelDescription,
} from "./MetricForm.styled";

const QUERY_BUILDER_FEATURES = {
  filter: true,
  aggregation: true,
};

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

  return (
    <Formik
      initialValues={metric ?? {}}
      isInitialValid={false}
      validate={getFormErrors}
      onSubmit={onSubmit}
    >
      {({ isValid, handleSubmit }) => (
        <FormRoot onSubmit={handleSubmit}>
          <FormBody>
            <FormLabel
              title={isNew ? t`Create Your Metric` : t`Edit Your Metric`}
              description={
                isNew
                  ? t`You can create saved metrics to add a named metric option. Saved metrics include the aggregation type, the aggregated field, and optionally any filter you add. As an example, you might use this to create something like the official way of calculating "Average Price" for an Orders table.`
                  : t`Make changes to your metric and leave an explanatory note.`
              }
            >
              <FormQueryBuilder
                name="definition"
                features={QUERY_BUILDER_FEATURES}
                canChangeTable={isNew}
                previewSummary={getPreviewSummary(previewSummary)}
                updatePreviewSummary={updatePreviewSummary}
              />
            </FormLabel>
            <FormBodyContent>
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

interface FormLabelProps {
  title?: string;
  description?: string;
  children?: ReactNode;
}

const FormLabel = ({ title, description, children }: FormLabelProps) => {
  return (
    <FormLabelRoot>
      <FormLabelContent>
        {title && <FormLabelTitle>{title}</FormLabelTitle>}
        {description && (
          <FormLabelDescription>{description}</FormLabelDescription>
        )}
      </FormLabelContent>
      {children}
    </FormLabelRoot>
  );
};

interface FormInputProps {
  name: string;
  placeholder?: string;
}

const FormInput = ({ name, placeholder }: FormInputProps): JSX.Element => {
  return (
    <Field name={name}>
      {({ field, meta }: FieldProps) => (
        <FormInputRoot
          {...field}
          className="input"
          type="text"
          placeholder={placeholder}
          touched={meta.touched}
          error={meta.error}
        />
      )}
    </Field>
  );
};

interface FormTextAreaProps {
  name: string;
  placeholder?: string;
}

const FormTextArea = ({
  name,
  placeholder,
}: FormTextAreaProps): JSX.Element => {
  return (
    <Field name={name}>
      {({ field, meta }: FieldProps) => (
        <FormInputRoot
          {...field}
          as="textarea"
          className="input"
          placeholder={placeholder}
          touched={meta.touched}
          error={meta.error}
        />
      )}
    </Field>
  );
};

interface FormQueryBuilderProps {
  name: string;
  features?: Record<string, boolean>;
  canChangeTable?: boolean;
  previewSummary?: string;
  updatePreviewSummary: (previewSummary: string) => void;
}

const FormQueryBuilder = ({
  name,
  features,
  canChangeTable,
  previewSummary,
  updatePreviewSummary,
}: FormQueryBuilderProps): JSX.Element => {
  return (
    <Field name={name}>
      {({ field }: FieldProps) => (
        <PartialQueryBuilder
          value={field.value}
          features={features}
          canChangeTable={canChangeTable}
          previewSummary={previewSummary}
          onChange={(value: string) =>
            field.onChange({ target: { name, value } })
          }
          updatePreviewSummary={updatePreviewSummary}
        />
      )}
    </Field>
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
      <FormSubmitButton type="submit" primary={isValid} disabled={!isValid}>
        {t`Save changes`}
      </FormSubmitButton>
      <Button as={Link} to="/admin/datamodel/metrics">
        {t`Cancel`}
      </Button>
    </div>
  );
};

const getPreviewSummary = (previewSummary?: string) => {
  if (previewSummary) {
    return t`Result: ${formatValue(previewSummary)}`;
  } else {
    return "";
  }
};

const getFormErrors = (values: Partial<Metric>) => {
  const errors: Record<string, string> = {};

  if (!values.name) {
    errors.name = t`Name is required`;
  }

  if (!values.description) {
    errors.description = t`Description is required`;
  }

  if (values.id != null && !values.revision_message) {
    errors.revision_message = t`Revision message is required`;
  }

  const aggregations =
    values.definition && Q.getAggregations(values.definition);
  if (!aggregations || aggregations.length === 0) {
    errors.definition = t`Aggregation is required`;
  }

  return errors;
};

export default MetricForm;
