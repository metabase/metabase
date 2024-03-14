import type { FieldInputProps } from "formik";
import { useFormik } from "formik";
import { useEffect } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { FieldSet } from "metabase/components/FieldSet";
import Button from "metabase/core/components/Button/Button";
import { formatValue } from "metabase/lib/formatting";
import * as Q from "metabase-lib/v1/queries/utils/query";
import type { Segment, StructuredQuery } from "metabase-types/api";

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
} from "./SegmentForm.styled";

const QUERY_BUILDER_FEATURES = {
  filter: true,
};

export interface SegmentFormProps {
  segment?: Segment;
  previewSummary?: string;
  updatePreviewSummary: (previewSummary: string) => void;
  onIsDirtyChange: (isDirty: boolean) => void;
  onSubmit: (values: Partial<Segment>) => void;
}

const SegmentForm = ({
  segment,
  previewSummary,
  updatePreviewSummary,
  onIsDirtyChange,
  onSubmit,
}: SegmentFormProps): JSX.Element => {
  const isNew = segment == null;

  const { isValid, getFieldProps, getFieldMeta, handleSubmit, dirty } =
    useFormik({
      initialValues: segment ?? {},
      isInitialValid: false,
      validate: getFormErrors,
      onSubmit,
    });

  useEffect(() => {
    onIsDirtyChange(dirty);
  }, [dirty, onIsDirtyChange]);

  return (
    <FormRoot onSubmit={handleSubmit}>
      <FormBody>
        <FormLabel
          title={isNew ? t`Create Your Segment` : t`Edit Your Segment`}
          description={
            isNew
              ? t`Select and add filters to create your new segment.`
              : t`Make changes to your segment and leave an explanatory note.`
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
            title={t`Name Your Segment`}
            description={t`Give your segment a name to help others find it.`}
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
            title={t`Describe Your Segment`}
            description={t`Give your segment a description to help others understand what it's about.`}
          >
            <FormTextArea
              {...getFieldProps("description")}
              {...getFieldMeta("description")}
              id="description"
              placeholder={t`This is a good place to be more specific about less obvious segment rules`}
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
                  placeholder={t`This will show up in the revision history for this segment to help everyone remember why things changed`}
                />
              </FormLabel>
              <FormFooterContent>
                <SegmentFormActions isValid={isValid} />
              </FormFooterContent>
            </FieldSet>
          )}
        </FormBodyContent>
      </FormBody>
      {isNew && (
        <FormFooter>
          <FormSection>
            <SegmentFormActions isValid={isValid} />
          </FormSection>
        </FormFooter>
      )}
    </FormRoot>
  );
};

interface SegmentFormActionsProps {
  isValid: boolean;
}

const SegmentFormActions = ({
  isValid,
}: SegmentFormActionsProps): JSX.Element => {
  return (
    <div>
      <FormSubmitButton type="submit" primary={isValid} disabled={!isValid}>
        {t`Save changes`}
      </FormSubmitButton>
      <Button as={Link} to="/admin/datamodel/segments">
        {t`Cancel`}
      </Button>
    </div>
  );
};

const getResultSummary = (previewSummary?: string) => {
  return previewSummary ? t`${formatValue(previewSummary)} rows` : "";
};

const getFormErrors = (values: Partial<Segment>) => {
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

  const filters = values.definition && Q.getFilters(values.definition);
  if (!filters || filters.length === 0) {
    errors.definition = t`At least one filter is required`;
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
export default SegmentForm;
