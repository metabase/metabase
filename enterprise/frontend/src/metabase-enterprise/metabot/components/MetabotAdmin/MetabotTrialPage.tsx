import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { Divider, Flex, Group, List, Stack, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { MetabotSettingUpModal } from "./MetabotSettingUpModal";
import { handleFieldError, isFetchBaseQueryError } from "./utils";

interface MetabotTrialFormFields {
  terms_of_service: boolean;
}

export const MetabotTrialPage = () => {
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const [purchaseCloudAddOn] = usePurchaseCloudAddOnMutation();
  const onSubmit = useCallback(
    async ({ terms_of_service }: MetabotTrialFormFields) => {
      settingUpModalHandlers.open();
      await purchaseCloudAddOn({
        product_type: "metabase-ai",
        terms_of_service,
      })
        .unwrap()
        .catch((error: unknown) => {
          settingUpModalHandlers.close();
          if (isFetchBaseQueryError(error)) {
            handleFieldError<MetabotTrialFormFields>(
              error.data,
              "terms_of_service",
            );
          }
          throw error;
        });
    },
    [purchaseCloudAddOn, settingUpModalHandlers],
  );

  const validationSchema = Yup.object({
    terms_of_service: Yup.boolean()
      .required()
      .isTrue(t`Terms of Service must be accepted`),
  });

  return (
    <SettingsPageWrapper title={t`Metabot AI`}>
      <SettingsSection
        title={
          /* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */
          t`Get a free month of Metabot, the new AI assistant for Metabase.`
        }
      >
        <Stack>
          <Text>{t`Metabot helps you move faster and understand your data better. You can ask it to:`}</Text>
          <List>
            <List.Item>
              <Markdown>{
                /* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */
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
                        <ExternalLink href="https://www.metabase.com/license/hosting">{t`Terms of Service`}</ExternalLink>
                      </Text>
                    }
                  />
                  <Flex justify="start">
                    <Group align="center" gap="sm">
                      <FormSubmitButton
                        disabled={!values.terms_of_service}
                        label={t`Add Metabot AI`}
                        failedLabel={t`Failed to add Metabot AI`}
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
              /* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */
              t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`
            }
          </Text>
        )}
      </SettingsSection>
      <MetabotSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
      />
    </SettingsPageWrapper>
  );
};
