import type { FieldInputProps } from "formik";
import { Link } from "react-router";
import { t } from "ttag";

import {
  getSegmentQuery,
  getSegmentQueryDefinition,
} from "metabase/admin/datamodel/utils/segments";
import { FieldSet } from "metabase/common/components/FieldSet";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { SegmentEditor } from "metabase/querying/segments/components/SegmentEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Flex, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  CreateSegmentRequest,
  Segment,
  StructuredQuery,
  TableId,
  UpdateSegmentRequest,
} from "metabase-types/api";

type SegmentFormValues = Partial<CreateSegmentRequest & UpdateSegmentRequest>;
export interface SegmentFormProps {
  segment?: Segment;
  onSubmit: (values: SegmentFormValues) => void;
  setIsDirty: (isDirty: boolean) => void;
}

export const SegmentForm = ({
  segment,
  onSubmit,
  setIsDirty,
}: SegmentFormProps): JSX.Element => {
  const isNew = segment == null;
  const metadata = useSelector(getMetadata);

  return (
    <FormProvider<SegmentFormValues>
      initialValues={segment ?? {}}
      enableReinitialize
      onSubmit={onSubmit}
      validate={(values) => getFormErrors(values, metadata)}
    >
      {({ isValid, dirty, getFieldProps, errors }) => {
        setIsDirty(dirty);

        return (
          <Form>
            <Stack gap="lg" p="md">
              <Box>
                <Text fw="bold">
                  {isNew ? t`Create Your Segment` : t`Edit Your Segment`}
                </Text>
                <Text fz="sm" mb="sm">
                  {isNew
                    ? t`Select and add filters to create your new segment.`
                    : t`Make changes to your segment and leave an explanatory note.`}
                </Text>
                <SegmentEditor
                  {...getSegmentEditorProps(
                    getFieldProps("definition"),
                    getFieldProps("table_id"),
                    metadata,
                  )}
                  isNew={isNew}
                />
                {errors?.definition && (
                  <Text c="error" fz="sm" mt="xs">
                    {errors.definition ?? t`At least one filter is required`}
                  </Text>
                )}
              </Box>
              <FormTextInput
                name="name"
                label={t`Name Your Segment`}
                description="Give your segment a name to help others find it."
                required
                placeholder={t`Something descriptive but not too long`}
              />
              <FormTextarea
                name="description"
                label={t`Describe Your Segment`}
                description="Give your segment a description to help others understand what it's about."
                placeholder={t`This is a good place to be more specific about less obvious segment rules`}
                required
              />
              {!isNew && (
                <FieldSet legend={t`Reason For Changes`} noPadding={false}>
                  <FormTextarea
                    name="revision_message"
                    required
                    description={t`Leave a note to explain what changes you made and why they were required.`}
                    id="revision_message"
                    placeholder={t`This will show up in the revision history for this segment to help everyone remember why things changed`}
                  />
                </FieldSet>
              )}
              <Box>
                <FormErrorMessage />
              </Box>
              <SegmentFormActions isValid={isValid && dirty} />
            </Stack>
          </Form>
        );
      }}
    </FormProvider>
  );
};

interface SegmentFormActionsProps {
  isValid: boolean;
}

const SegmentFormActions = ({
  isValid,
}: SegmentFormActionsProps): JSX.Element => {
  return (
    <Flex justify="flex-end" gap="sm">
      <Button component={Link} to="/admin/datamodel/segments">
        {t`Cancel`}
      </Button>
      <FormSubmitButton
        variant="filled"
        disabled={!isValid}
        label={t`Save changes`}
      />
    </Flex>
  );
};

const getFormErrors = (
  values: SegmentFormValues,
  metadata: Metadata,
): Record<string, string> => {
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
  definitionProps: FieldInputProps<StructuredQuery | undefined>,
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
