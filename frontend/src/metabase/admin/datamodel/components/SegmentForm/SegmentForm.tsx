import type { FieldInputProps } from "formik";
import { useFormik } from "formik";
import { useEffect } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { FieldSet } from "metabase/components/FieldSet";
import Button from "metabase/core/components/Button/Button";
import { useSelector } from "metabase/lib/redux";
import { SegmentEditor } from "metabase/querying/segments/components/SegmentEditor";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import * as Q from "metabase-lib/v1/queries/utils/query";
import type { Segment, StructuredQuery } from "metabase-types/api";

import FormInput from "../FormInput";
import FormLabel from "../FormLabel";
import FormTextArea from "../FormTextArea";

import {
  FormBody,
  FormBodyContent,
  FormFooter,
  FormFooterContent,
  FormRoot,
  FormSection,
  FormSubmitButton,
} from "./SegmentForm.styled";

export interface SegmentFormProps {
  segment?: Segment;
  previewSummary?: string;
  updatePreviewSummary: (previewSummary: string) => void;
  onIsDirtyChange: (isDirty: boolean) => void;
  onSubmit: (values: Partial<Segment>) => void;
}

const SegmentForm = ({
  segment,
  onIsDirtyChange,
  onSubmit,
}: SegmentFormProps): JSX.Element => {
  const isNew = segment == null;
  const metadata = useSelector(getMetadata);

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
          <SegmentEditor
            {...getSegmentEditorProps(getFieldProps("definition"), metadata)}
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

function getQuery(metadata: Metadata, definition: StructuredQuery | undefined) {
  const tableId = definition?.["source-table"];
  const table = metadata.table(tableId);
  const metadataProvider = table
    ? Lib.metadataProvider(table.db_id, metadata)
    : undefined;

  return table && definition && metadataProvider
    ? Lib.fromLegacyQuery(table.db_id, metadataProvider, {
        type: "query",
        database: table.db_id,
        query: definition,
      })
    : undefined;
}

function getQueryDefinition(query: Lib.Query) {
  const datasetQuery = Lib.toLegacyQuery(query);
  if (datasetQuery.type === "query") {
    return datasetQuery.query;
  }
}

function getSegmentEditorProps(
  { name, value, onChange }: FieldInputProps<StructuredQuery | undefined>,
  metadata: Metadata,
) {
  return {
    query: getQuery(metadata, value),
    onChange: (query: Lib.Query) =>
      onChange({ target: { name, value: getQueryDefinition(query) } }),
  };
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SegmentForm;
