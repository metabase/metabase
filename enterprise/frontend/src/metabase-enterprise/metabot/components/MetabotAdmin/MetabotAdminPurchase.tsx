import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { useCallback, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { usePurchaseMetabotCloudAddOnMutation } from "metabase/api/metabot";
import ExternalLink from "metabase/common/components/ExternalLink";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  Box,
  Button,
  Divider,
  Flex,
  Group,
  List,
  Loader,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";

// https://redux-toolkit.js.org/rtk-query/usage/error-handling
// https://redux-toolkit.js.org/rtk-query/usage-with-typescript#type-safe-error-handling
const isFetchBaseQueryError = (error: unknown): error is FetchBaseQueryError =>
  error instanceof Object && "status" in error && "data" in error;

type IFieldError =
  | string
  | {
      message: string;
    }
  | {
      errors: { [key: string]: any };
    };

const isFieldError = (error: unknown): error is IFieldError =>
  typeof error === "string" ||
  (error instanceof Object &&
    (("message" in error && typeof error.message === "string") ||
      ("errors" in error &&
        error.errors instanceof Object &&
        "terms_of_service" in error.errors &&
        typeof error.errors.terms_of_service === "string")));

export const handleFieldError = (error: unknown) => {
  if (isFieldError(error)) {
    if (typeof error === "string") {
      throw { data: { errors: { terms_of_service: error } } };
    } else if ("message" in error) {
      throw { data: { errors: { terms_of_service: error.message } } };
    } else if ("errors" in error) {
      throw { data: error };
    }
  }
};

const validationSchema = Yup.object({
  terms_of_service: Yup.boolean(),
});

interface MetabotPurchaseFormFields {
  terms_of_service: boolean;
}

const MetabotAdminSettingUpModal = ({
  onClose,
  opened,
}: Pick<ModalProps, "opened" | "onClose">) => (
  <Modal
    opened={opened}
    onClose={onClose}
    closeOnClickOutside={false}
    closeOnEscape={false}
    withCloseButton={false}
    size="30rem"
    padding="2.5rem"
    title={undefined}
    mah="80%"
  >
    <Stack align="center" gap="lg" my="4.5rem">
      <Box h={96} pos="relative" w={96}>
        <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />

        <Flex
          bottom={0}
          align="center"
          direction="row"
          gap={0}
          justify="center"
          pos="absolute"
          right={0}
          wrap="nowrap"
          bg="white"
          fz={0}
          p="sm"
          ta="center"
          style={{
            borderRadius: "100%",
            // eslint-disable-next-line no-color-literals
            boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 6px 0 rgba(0, 0, 0, 0.10)`,
          }}
        >
          <Loader size="xs" ml={1} mt={1} />
        </Flex>
      </Box>

      <Box ta="center">
        <Title c="text-primary" fz="lg">
          {t`Setting up Metabot AI, please wait`}
        </Title>
        <Text c="text-secondary" fz="md" lh={1.43}>
          {t`This will take just a minute or so.`}
        </Text>
        <Text c="text-secondary" fz="md" lh={1.43}>
          {t`Please reload this page to start exploring.`}
        </Text>
      </Box>

      <Button variant="filled" size="md" onClick={onClose}>
        {t`Done`}
      </Button>
    </Stack>
  </Modal>
);

export const MetabotAdminPurchase = () => {
  const [showMetabotAdminSettingUpModal, setMetabotAdminSettingUpModal] =
    useState(false);
  const [purchaseMetabotAddOn] = usePurchaseMetabotCloudAddOnMutation();
  const onSubmit = useCallback(
    async ({ terms_of_service }: MetabotPurchaseFormFields) => {
      setMetabotAdminSettingUpModal(true);
      purchaseMetabotAddOn({
        terms_of_service,
      })
        .unwrap()
        .then()
        .catch((error: unknown) => {
          isFetchBaseQueryError(error) && handleFieldError(error.data);
        });
    },
    [purchaseMetabotAddOn],
  );

  return (
    <SettingsPageWrapper title={t`Metabot AI`}>
      <SettingsSection
        // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
        title={t`Get a free month of Metabot, the new AI assistant for Metabase.`}
      >
        <Stack>
          <Text>{t`Metabot helps you move faster and understand your data better. You can ask it to:`}</Text>
          <List>
            <List.Item>
              <Text
                component="span"
                fw="bold"
              >{t`Act as a SQL generation copilot`}</Text>{" "}
              {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
              <Text component="span">{t`in the Metabase SQL editor`}</Text>
            </List.Item>
            <List.Item>
              <Text
                component="span"
                fw="bold"
              >{t`Help you build queries`}</Text>{" "}
              <Text component="span">{t`based on models and metrics in a specified collection`}</Text>
            </List.Item>
            <List.Item>
              <Text component="span" fw="bold">{t`Explain queries`}</Text>{" "}
              <Text component="span">{t`or existing charts`}</Text>
            </List.Item>
          </List>
          <Text>{t`Metabot is a new feature in active development. We're constantly rolling out improvements and appreciate your feedback.`}</Text>
        </Stack>
        <Divider />
        <FormProvider
          initialValues={{ terms_of_service: false }}
          onSubmit={onSubmit}
          validationSchema={validationSchema}
        >
          {({ values }) => (
            <Form>
              <Stack>
                <FormCheckbox
                  name="terms_of_service"
                  label={
                    <Text>
                      {t`I agree with the Metabot AI add-on`}{" "}
                      <ExternalLink href="https://www.metabase.com/license/metabot-addendum">{t`Terms of Service`}</ExternalLink>
                    </Text>
                  }
                />
                <Flex justify="start">
                  <Group align="center" gap="sm">
                    <FormSubmitButton
                      disabled={!values.terms_of_service}
                      label={t`Add Metabot AI`}
                      variant="filled"
                      mt="xs"
                    />
                  </Group>
                </Flex>
                <Text>
                  {t`Your first month is on us.`}
                  <Text
                    component="span"
                    fw="bold"
                  >{t`You won't be charged automatically.`}</Text>{" "}
                  {t`After the trial, you can decide if you'd like to subscribe.`}
                </Text>
              </Stack>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>
      <MetabotAdminSettingUpModal
        opened={showMetabotAdminSettingUpModal}
        onClose={() => setMetabotAdminSettingUpModal(false)}
      />
    </SettingsPageWrapper>
  );
};
