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
import { Box, Divider, Flex, Modal, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { FieldId } from "metabase-types/api";

export interface AddRowModalProps {
  question: Question;
  onClose: () => void;
}

export const AddRowModal = ({ question, onClose }: AddRowModalProps) => {
  const table = question.legacyQueryTable();
  // const dispatch = useDispatch();

  const fields = table?.fields;

  const handleSubmit = (values: unknown) => {
    // eslint-disable-next-line no-console
    console.log("AddRowModal.handleSubmit", values);

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
                (field: any) =>
                  !["type/PK", "type/CreationTimestamp"].includes(
                    field.semantic_type,
                  ),
              )
              .map((field: any) => {
                const { name, display_name, database_required } = field;

                let input = (
                  <FormTextInput
                    name={name}
                    label={display_name}
                    required={database_required}
                    withAsterisk={database_required}
                  />
                );

                if (field.database_type === "TIMESTAMP") {
                  input = (
                    <FormTextInput
                      type="datetime-local"
                      name={name}
                      label={display_name}
                      required={database_required}
                    />
                  );
                }

                if (field.database_type === "BOOLEAN") {
                  input = (
                    <FormCheckbox
                      name={name}
                      label={display_name}
                      required={database_required}
                    />
                  );
                }

                return (
                  <Box key={field.id as FieldId}>
                    {input}
                    <Text size="xs">database_type: {field.database_type}</Text>
                  </Box>
                );
              })}
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
