import type { FieldInputProps } from "formik";
import { useFormik } from "formik";
import { useEffect } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  getSegmentQuery,
  getSegmentQueryDefinition,
} from "metabase/admin/datamodel/utils/segments";
import { Button } from "metabase/common/components/Button/Button";
import { FieldSet } from "metabase/common/components/FieldSet";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { SegmentEditor } from "metabase/querying/segments/components/SegmentEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Alert } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery, Segment, TableId } from "metabase-types/api";

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
  onIsDirtyChange: (isDirty: boolean) => void;
  onSubmit: (values: Partial<Segment>) => void;
}

export const SegmentForm = ({
  segment,
  onIsDirtyChange,
  onSubmit,
}: SegmentFormProps): JSX.Element => {
  const isNew = segment == null;
  const metadata = useSelector(getMetadata);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { isValid, getFieldProps, getFieldMeta, handleSubmit, dirty } =
    useFormik({
      initialValues: segment ?? {},
      isInitialValid: false,
      validate: (values) => getFormErrors(values, metadata),
      onSubmit,
    });
  const tableId = isNew ? getFieldProps("table_id")?.value : segment?.table_id;
  const table = tableId ? metadata.tables[tableId] : undefined;
  const isReadOnly = isRemoteSyncReadOnly && !!table?.is_published;

  useEffect(() => {
    onIsDirtyChange(dirty);
  }, [dirty, onIsDirtyChange]);

  return (
    <FormRoot onSubmit={handleSubmit}>
      <FormBody>
        {isReadOnly && (
          <Alert
            color="warning"
            display="inline-flex"
            mb="md"
            p="0.75rem"
            title={t`This segment can't be edited because this table is published and Remote Sync is in read-only mode.`}
            variant="outline"
            w="auto"
          />
        )}
        <FormLabel
          title={isNew ? t`Create Your Segment` : t`Edit Your Segment`}
          description={
            isNew
              ? t`Select and add filters to create your new segment.`
              : t`Make changes to your segment and leave an explanatory note.`
          }
        >
          <SegmentEditor
            {...getSegmentEditorProps(
              getFieldProps("definition"),
              getFieldProps("table_id"),
              metadata,
            )}
            isNew={isNew}
            readOnly={isReadOnly}
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
              readOnly={isReadOnly}
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
              readOnly={isReadOnly}
            />
          </FormLabel>
          {!isNew && !isReadOnly && (
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
      {isNew && !isReadOnly && (
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

const getFormErrors = (values: Partial<Segment>, metadata: Metadata) => {
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

  const query = getSegmentQuery(values.definition, values.table_id, metadata);
  const filters = query ? Lib.filters(query, -1) : [];
  if (filters.length === 0) {
    errors.definition = t`At least one filter is required`;
  }

  return errors;
};

function getSegmentEditorProps(
  definitionProps: FieldInputProps<DatasetQuery | undefined>,
  tableIdProps: FieldInputProps<TableId | undefined>,
  metadata: Metadata,
) {
  return {
    query: getSegmentQuery(definitionProps.value, tableIdProps.value, metadata),
    onChange: (query: Lib.Query) => {
      definitionProps.onChange({
        target: {
          name: definitionProps.name,
          value: getSegmentQueryDefinition(query),
        },
      });
      tableIdProps.onChange({
        target: {
          name: tableIdProps.name,
          value: Lib.sourceTableOrCardId(query),
        },
      });
    },
  };
}
