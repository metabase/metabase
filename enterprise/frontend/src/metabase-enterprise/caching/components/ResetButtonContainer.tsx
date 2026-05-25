import { useFormikContext } from "formik";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { Form, FormSubmitButton, useFormContext } from "metabase/forms";
import { Box, Flex, Group, Icon, Loader, Text } from "metabase/ui";

import S from "./ResetButtonContainer.module.css";

export const ResetButtonContainer = () => {
  return (
    <Box
      pb="1rem"
      mt="auto"
      style={{ marginInlineStart: "auto", marginInlineEnd: "1.5rem" }}
    >
      <ResetAllToDefaultButtonFormBody />
    </Box>
  );
};

const ResetAllToDefaultButtonFormBody = () => {
  const { submitForm } = useFormikContext();
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const { status } = useFormContext();

  const confirmResetAllToDefault = () => {
    askConfirmation({
      title: t`Reset all database caching policies to the default?`,
      message: "",
      confirmButtonText: t`Reset`,
      onConfirm: submitForm,
    });
  };

  return (
    <>
      <Form>
        <Flex justify="flex-end">
          <FormSubmitButton
            px="1rem"
            py=".75rem"
            lh="1"
            onClick={(e) => {
              confirmResetAllToDefault();
              e.preventDefault();
              return false;
            }}
            label={
              <Text
                // Prevents the label from getting cut off vertically
                h="1rem"
                lh="1"
                fw="normal"
                color="error"
              >{t`Reset all to default`}</Text>
            }
            activeLabel={<Loader size="xs" />}
            successLabel={
              <Text fw="bold" lh="1" color="success">
                <Group gap="xs">
                  <Icon name="check" /> {t`Success`}
                </Group>
              </Text>
            }
            variant="subtle"
            // Suppress the hover background while the form is mid-submission or
            // showing the post-submit success state.
            className={status === "idle" ? S.highlightOnHover : undefined}
          />
        </Flex>
      </Form>
      {confirmationModal}
    </>
  );
};
