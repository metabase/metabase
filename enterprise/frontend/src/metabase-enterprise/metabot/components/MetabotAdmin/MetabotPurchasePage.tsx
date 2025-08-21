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
import { Divider, Flex, Group, List, Stack, Text } from "metabase/ui";
import { MetabotPurchaseSettingUpModal } from "metabase-enterprise/metabot/components/MetabotAdmin/MetabotPurchaseSettingUpModal";

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
  if (!isFieldError(error)) {
    return;
  }

  if (typeof error === "string") {
    throw { data: { errors: { terms_of_service: error } } };
  }

  if ("message" in error) {
    throw { data: { errors: { terms_of_service: error.message } } };
  }

  if ("errors" in error) {
    throw { data: error };
  }
};

const validationSchema = Yup.object({
  terms_of_service: Yup.boolean(),
});

interface MetabotPurchaseFormFields {
  terms_of_service: boolean;
}

export const MetabotPurchasePage = () => {
  const [showSettingUpModal, setSettingUpModal] = useState(false);
  const [purchaseMetabotAddOn] = usePurchaseMetabotCloudAddOnMutation();
  const onSubmit = useCallback(
    async ({ terms_of_service }: MetabotPurchaseFormFields) => {
      purchaseMetabotAddOn({
        terms_of_service,
      })
        .unwrap()
        .then(() => setSettingUpModal(true))
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
                  {t`Your first month is on us.`}{" "}
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
      <MetabotPurchaseSettingUpModal
        opened={showSettingUpModal}
        onClose={() => setSettingUpModal(false)}
      />
    </SettingsPageWrapper>
  );
};
