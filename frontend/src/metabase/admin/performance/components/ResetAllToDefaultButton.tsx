import { useFormikContext } from "formik";
import { t } from "ttag";

import { Form, FormSubmitButton } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { Box, Flex, Group, Icon, Text } from "metabase/ui";

// TODO:
// Rename to ResetAllToDefaultButtonContainer
export const ResetAllToDefaultButton = ({
  rootConfigLabel,
}: {
  rootConfigLabel: string;
}) => {
  return (
    <Box
      pb="1rem"
      mt="auto"
      style={{ marginInlineStart: "auto", marginInlineEnd: ".75rem" }}
    >
      <ResetAllToDefaultButtonFormBody rootConfigLabel={rootConfigLabel} />
    </Box>
  );
};

const ResetAllToDefaultButtonFormBody = ({
  rootConfigLabel,
}: {
  rootConfigLabel: string;
}) => {
  const { submitForm } = useFormikContext();
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const confirmResetAllToDefault = () => {
    askConfirmation({
      title: t`Reset all database caching policies to ${rootConfigLabel}?`,
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
            onClick={e => {
              confirmResetAllToDefault();
              e.preventDefault();
              return false;
            }}
            styles={{
              root: {
                // TODO: Fix this background color
                "&:hover": "background-color: rgba(237, 110, 110, .15)",
              },
            }}
            label={
              <Text
                lh="1"
                fw="normal"
                color="error"
              >{t`Reset all to default`}</Text>
            }
            activeLabel={t`Resetting...`}
            successLabel={
              <Text fw="bold" lh="1" color="success">
                <Group spacing="xs">
                  <Icon name="check" /> {t`Success`}
                </Group>
              </Text>
            }
            variant="subtle"
            color="error"
          />
        </Flex>
      </Form>
      {confirmationModal}
    </>
  );
};
