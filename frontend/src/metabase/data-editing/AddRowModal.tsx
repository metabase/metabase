import { t } from "ttag";

import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
// import { useDispatch } from "metabase/lib/redux";
// import { addUndo } from "metabase/redux/undo";
import { POST } from "metabase/lib/api";
import { Box, Divider, Flex, Modal, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Field } from "metabase-types/api";

type FieldWithAdditionalData = Field & {
  database_required?: boolean;
  database_type?: string;
};

export interface AddRowModalProps {
  question: Question;
  onClose: () => void;
}

export const AddRowModal = ({ question, onClose }: AddRowModalProps) => {
  const table = question.legacyQueryTable();
  // const dispatch = useDispatch();

  const fields = table?.fields as FieldWithAdditionalData[] | undefined;
  const tableId = question.card()?.table_id ?? table?.id;

  const handleSubmit = async (values: unknown) => {
    // eslint-disable-next-line no-console
    console.log("AddRowModal.handleSubmit", values);

    await POST(`/api/internal-tools/table/${tableId}`)({
      row: values,
    });
    // dispatch(addUndo({ message: t`The alert was successfully deleted.` }));
    onClose();
  };

  return (
    <Modal opened size="lg" onClose={onClose}>
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form role="form" data-testid="add-row-form">
          <Stack>
            {fields
              ?.filter(
                field =>
                  !["type/PK", "type/CreationTimestamp"].includes(
                    field.semantic_type as string,
                  ),
              )
              .map(field => (
                <Box key={field.id as any}>
                  {getFormInput(field)}
                  <Text size="xs">
                    database_type: {field.database_type}, semantic_type:{" "}
                    {field.semantic_type}
                  </Text>
                </Box>
              ))}
          </Stack>
          <Divider my="md" />
          <Flex justify="flex-end" gap="md">
            <FormSubmitButton
              variant="outline"
              label={t`Add new row`}
              my="sm"
              px="lg"
              radius="md"
            />
          </Flex>
        </Form>
      </FormProvider>
    </Modal>
  );
};

const getFormInput = ({
  name,
  display_name,
  database_required,
  database_type,
}: FieldWithAdditionalData) => {
  if (database_type === "TIMESTAMP") {
    return (
      <FormTextInput
        type="datetime-local"
        name={name}
        label={display_name}
        required={database_required}
      />
    );
  }

  if (database_type === "BOOLEAN") {
    return (
      <FormCheckbox
        name={name}
        label={display_name}
        required={database_required}
      />
    );
  }

  return (
    <FormTextInput
      name={name}
      label={display_name}
      required={database_required}
      withAsterisk={database_required}
    />
  );
};
