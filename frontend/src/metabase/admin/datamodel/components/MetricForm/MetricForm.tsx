import type { FieldInputProps } from "formik";
import { useFormikContext } from "formik";
import { useEffect } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { FieldSet } from "metabase/components/FieldSet";
import Button from "metabase/core/components/Button";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { formatValue } from "metabase/lib/formatting";
import { Group, Stack } from "metabase/ui";
import * as Q from "metabase-lib/v1/queries/utils/query";
import type { Metric, StructuredQuery } from "metabase-types/api";

import FormInput from "../FormInput";
import FormLabel from "../FormLabel";
import FormTextArea from "../FormTextArea";
import PartialQueryBuilder from "../PartialQueryBuilder";

import {
  FormSection,
  FormBody,
  FormBodyContent,
  FormFooter,
  FormFooterContent,
} from "./MetricForm.styled";

const QUERY_BUILDER_FEATURES = {
  filter: true,
  aggregation: true,
};

export interface MetricFormProps {
  metric?: Metric;
  previewSummary?: string;
  updatePreviewSummary: (previewSummary: string) => void;
  onIsDirtyChange: (isDirty: boolean) => void;
  onSubmit: (values: Partial<Metric>) => void;
}

const DirtyNotifier = ({
  onIsDirtyChange,
}: {
  onIsDirtyChange: (isDirty: boolean) => void;
}) => {
  const { dirty } = useFormikContext();
  useEffect(() => {
    onIsDirtyChange(dirty);
  }, [dirty, onIsDirtyChange]);
  return null;
};

const MetricForm = ({
  metric,
  previewSummary,
  updatePreviewSummary,
  onIsDirtyChange,
  onSubmit,
}: MetricFormProps): JSX.Element => {
  const isNew = metric == null;

  return (
    <FormProvider
      initialValues={metric ?? {}}
      isInitialValid={false}
      validate={getFormErrors}
      onSubmit={onSubmit}
    >
      {({ getFieldProps, getFieldMeta }) => (
        <Form>
          <DirtyNotifier onIsDirtyChange={onIsDirtyChange} />
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
                htmlFor="name"
                title={t`Name Your Metric`}
                description={t`Give your metric a name to help others find it.`}
              >
                <FormInput
                  {...getFieldProps("name")}
                  {...getFieldMeta("name")}
                  id="name"
                  placeholder={t`Something descriptive but not too long`}
                />
              </FormLabel>
              <FormLabel
                htmlFor="description"
                title={t`Describe Your Metric`}
                description={t`Give your metric a description to help others understand what it's about.`}
              >
                <FormTextArea
                  {...getFieldProps("description")}
                  {...getFieldMeta("description")}
                  id="description"
                  placeholder={t`This is a good place to be more specific about less obvious metric rules`}
                />
              </FormLabel>
              {!isNew && (
                <FieldSet legend={t`Reason For Changes`} noPadding={false}>
                  <FormLabel
                    htmlFor="revision_message"
                    description={t`Leave a note to explain what changes you made and why they were required.`}
                  >
                    <FormTextArea
                      {...getFieldProps("revision_message")}
                      {...getFieldMeta("revision_message")}
                      id="revision_message"
                      placeholder={t`This will show up in the revision history for this metric to help everyone remember why things changed`}
                    />
                  </FormLabel>
                  <FormFooterContent>
                    <MetricFormActions />
                  </FormFooterContent>
                </FieldSet>
              )}
            </FormBodyContent>
          </FormBody>
          {isNew && (
            <FormFooter>
              <FormSection>
                <MetricFormActions />
              </FormSection>
            </FormFooter>
          )}
        </Form>
      )}
    </FormProvider>
  );
};

const MetricFormActions = (): JSX.Element => {
  const { dirty, isValid } = useFormikContext();

  return (
    <Stack align="start" spacing="1rem" mb="1rem">
      <FormErrorMessage />
      <Group spacing="1rem">
        <FormSubmitButton
          variant="filled"
          disabled={!dirty || !isValid}
          label={t`Save changes`}
        />
        <Button as={Link} to="/admin/datamodel/metrics">
          {t`Cancel`}
        </Button>
      </Group>
    </Stack>
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
