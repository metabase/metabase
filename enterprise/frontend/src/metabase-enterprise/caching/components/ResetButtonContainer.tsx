import { useFormikContext } from "formik";
import { t } from "ttag";

import { Form, useFormContext } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { Box, Flex, Group, Icon, Loader, Text } from "metabase/ui";

import { ResetAllFormSubmitButton } from "./ResetButtonContainer.styled";

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
          <ResetAllFormSubmitButton
            px="1rem"
            py=".75rem"
            lh="1"
            onClick={e => {
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
                <Group spacing="xs">
                  <Icon name="check" /> {t`Success`}
                </Group>
              </Text>
            }
            variant="subtle"
            highlightOnHover={status === "idle"}
          />
        </Flex>
      </Form>
      {confirmationModal}
    </>
  );
};
