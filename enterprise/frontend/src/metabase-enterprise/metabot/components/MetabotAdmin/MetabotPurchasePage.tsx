import { useDisclosure } from "@mantine/hooks";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { useCallback } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { usePurchaseMetabotCloudAddOnMutation } from "metabase/api/metabot";
import ExternalLink from "metabase/common/components/ExternalLink";
import Markdown from "metabase/common/components/Markdown";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
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
  const currentUser = useSelector(getCurrentUser);
  const tokenStatus = useSetting("token-status");
  const storeUserEmails =
    tokenStatus?.["store-users"]?.map(({ email }) => email.toLowerCase()) ?? [];
  const isStoreUser = storeUserEmails.includes(
    currentUser?.email.toLowerCase(),
  );
  const anyStoreUserEmailAddress =
    storeUserEmails.length > 0 ? storeUserEmails[0] : undefined;

  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const [purchaseMetabotAddOn] = usePurchaseMetabotCloudAddOnMutation();
  const onSubmit = useCallback(
    async ({ terms_of_service }: MetabotPurchaseFormFields) => {
      settingUpModalHandlers.open();
      await purchaseMetabotAddOn({
        terms_of_service,
      })
        .unwrap()
        .catch((error: unknown) => {
          settingUpModalHandlers.close();
          isFetchBaseQueryError(error) && handleFieldError(error.data);
        });
    },
    [purchaseMetabotAddOn, settingUpModalHandlers],
  );

  return (
    <SettingsPageWrapper title={t`Metabot AI`}>
      <SettingsSection
        title={
          /* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */
          t`Get a free month of Metabot, the new AI assistant for Metabase.`
        }
      >
        <Stack>
          <Text>{t`Metabot helps you move faster and understand your data better. You can ask it to:`}</Text>
          <List>
            <List.Item>
              <Markdown>{
                /* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */
                t`**Act as a SQL generation copilot** in the Metabase SQL editor`
              }</Markdown>
            </List.Item>
            <List.Item>
              <Markdown>{t`**Help you build queries** based on models and metrics in a specified collection`}</Markdown>
            </List.Item>
            <List.Item>
              <Markdown>{t`**Explain queries** or existing charts`}</Markdown>
            </List.Item>
          </List>
          <video controls aria-label={t`Demonstration of Metabot AI features`}>
            <source
              src="https://www.metabase.com/images/features/metabot.mp4"
              type="video/mp4"
            />
            {t`Your browser does not support the video tag.`}
          </video>
          <Text>{t`Metabot is a new feature in active development. We're constantly rolling out improvements and appreciate your feedback.`}</Text>
        </Stack>
        <Divider />

        {isStoreUser ? (
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
                  <Markdown>
                    {t`Your first month is on us. **You won't be charged automatically.** After the trial, you can decide if you'd like to subscribe.`}
                  </Markdown>
                </Stack>
              </Form>
            )}
          </FormProvider>
        ) : (
          <Text fw="bold">
            {
              /* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */
              t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`
            }
          </Text>
        )}
      </SettingsSection>
      <MetabotPurchaseSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
      />
    </SettingsPageWrapper>
  );
};
