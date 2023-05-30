import React from "react";
import { Link } from "react-router";
import { useFormik } from "formik";
import type { FieldInputProps } from "formik";
import { t } from "ttag";
import { formatValue } from "metabase/lib/formatting";
import { Button } from "metabase/core/components/Button";
import FieldSet from "metabase/components/FieldSet";
import { Metric, StructuredQuery } from "metabase-types/api";
import useBeforeUnload from "metabase/hooks/use-before-unload";
import * as Q from "metabase-lib/queries/utils/query";
import FormInput from "../FormInput";
import FormLabel from "../FormLabel";
import FormTextArea from "../FormTextArea";
import PartialQueryBuilder from "../PartialQueryBuilder";
import {
  FormRoot,
  FormSection,
  FormBody,
  FormBodyContent,
  FormFooter,
  FormFooterContent,
  FormSubmitButton,
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

  const { isValid, getFieldProps, getFieldMeta, handleSubmit, dirty } =
    useFormik({
      initialValues: metric ?? {},
      isInitialValid: false,
      validate: getFormErrors,
      onSubmit,
    });

  useBeforeUnload(dirty);

  return (
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
          <PartialQueryBuilder
            {...getQueryBuilderProps(getFieldProps("definition"))}
            features={QUERY_BUILDER_FEATURES}
            canChangeTable={isNew}
            previewSummary={getResultSummary(previewSummary)}
            updatePreviewSummary={updatePreviewSummary}
          />
        </FormLabel>
        <FormBodyContent>
          <FormLabel
            title={t`Name Your Metric`}
            description={t`Give your metric a name to help others find it.`}
          >
            <FormInput
              {...getFieldProps("name")}
              {...getFieldMeta("name")}
              placeholder={t`Something descriptive but not too long`}
            />
          </FormLabel>
          <FormLabel
            title={t`Describe Your Metric`}
            description={t`Give your metric a description to help others understand what it's about.`}
          >
            <FormTextArea
              {...getFieldProps("description")}
              {...getFieldMeta("description")}
              placeholder={t`This is a good place to be more specific about less obvious metric rules`}
            />
          </FormLabel>
          {!isNew && (
            <FieldSet legend={t`Reason For Changes`} noPadding={false}>
              <FormLabel
                description={t`Leave a note to explain what changes you made and why they were required.`}
              >
                <FormTextArea
                  {...getFieldProps("revision_message")}
                  {...getFieldMeta("revision_message")}
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

const getResultSummary = (previewSummary?: string) => {
  return previewSummary ? t`Result: ${formatValue(previewSummary)}` : "";
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

const getQueryBuilderProps = ({
  name,
  value,
  onChange,
}: FieldInputProps<StructuredQuery>) => {
  return {
    value,
    onChange: (value: StructuredQuery) => onChange({ target: { name, value } }),
  };
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetricForm;
