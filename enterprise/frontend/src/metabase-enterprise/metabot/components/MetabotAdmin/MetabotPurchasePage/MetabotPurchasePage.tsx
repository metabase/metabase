import { useDisclosure } from "@mantine/hooks";
import { type ReactElement, useCallback } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import ExternalLink from "metabase/common/components/ExternalLink";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { Card, Stack, Text } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { MetabotSettingUpModal } from "../MetabotSettingUpModal";
import { handleFieldError, isFetchBaseQueryError } from "../utils";

import { MetabotRadios } from "./MetabotRadios";
import { useAddOnsBilling } from "./hooks";
import type { IMetabotPurchaseFormFields } from "./types";

export function MetabotPurchasePage(): ReactElement {
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const { isLoading, error, billingPeriodMonths, tiers, defaultQuantity } =
    useAddOnsBilling();
  const hasData =
    billingPeriodMonths !== undefined &&
    defaultQuantity !== undefined &&
    tiers.length > 0;

  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const [purchaseCloudAddOn] = usePurchaseCloudAddOnMutation();
  const onSubmit = useCallback(
    async ({ quantity, terms_of_service }: IMetabotPurchaseFormFields) => {
      settingUpModalHandlers.open();
      await purchaseCloudAddOn({
        product_type: "metabase-ai-tiered",
        quantity: parseInt(quantity, 10),
        terms_of_service,
      })
        .unwrap()
        .catch((error: unknown) => {
          settingUpModalHandlers.close();
          if (isFetchBaseQueryError(error)) {
            handleFieldError<IMetabotPurchaseFormFields>(
              error.data,
              "terms_of_service",
            );
          }
          throw error;
        });
    },
    [purchaseCloudAddOn, settingUpModalHandlers],
  );

  if (error || !hasData || isLoading) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={match({
          isLoading,
          hasData,
          error,
        })
          .with(
            { isLoading: false, hasData: P.any, error: P.nonNullable },
            { isLoading: false, hasData: false, error: P.any },
            () => t`Error fetching information about available add-ons.`,
          )
          .otherwise(() => null)}
      />
    );
  }

  const validationSchema = Yup.object({
    quantity: Yup.string()
      .required()
      .test(
        "quantity-is-int",
        t`Quantity must be a positive integer`,
        (v) => !!v && parseInt(v, 10) > 0,
      ),
    terms_of_service: Yup.boolean()
      .required()
      .isTrue(t`Terms of Service must be accepted`),
  });

  return (
    <SettingsPageWrapper title={t`Metabot AI`}>
      <Text maw="26rem">{t`Metabot helps you move faster and understand your data better. You can ask it to generate SQL, and build or explain queries.`}</Text>
      {isStoreUser ? (
        <SettingsSection
          title={t`Monthly usage limit`}
          description={
            <Text
              maw="35rem"
              mt="sm"
            >{t`Usage is measured in Metabot requests. If a chat has multiple questions, they are counted as separate Metabot requests. Usage limit applies to your whole organization.`}</Text>
          }
        >
          <FormProvider
            initialValues={{
              quantity: `${defaultQuantity}`,
              terms_of_service: false,
            }}
            onSubmit={onSubmit}
            validationSchema={validationSchema}
          >
            {({ values }) => (
              <Form>
                <Stack gap="xl" w="100%">
                  <MetabotRadios
                    quantity={values.quantity}
                    tiers={tiers}
                    billingPeriodMonths={billingPeriodMonths}
                  />

                  <Stack gap="md">
                    {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
                    <Text maw="35rem">{t`Additional amount for the add-on will be added to your next billing period invoice. You can cancel the add-on anytime in Metabase Store.`}</Text>

                    <Card
                      bg="var(--mb-color-background-secondary)"
                      p={12}
                      radius="md"
                      shadow="none"
                      w="100%"
                    >
                      <FormCheckbox
                        name="terms_of_service"
                        label={
                          <Text>
                            {t`I agree with the Metabot AI add-on`}{" "}
                            <ExternalLink href="https://www.metabase.com/license/hosting">{t`Terms of Service`}</ExternalLink>
                          </Text>
                        }
                      />
                    </Card>

                    <FormSubmitButton
                      disabled={!values.terms_of_service}
                      label={t`Confirm purchase`}
                      failedLabel={t`Failed to purchase Metabot AI`}
                      variant="filled"
                      w="100%"
                    />
                  </Stack>
                </Stack>
              </Form>
            )}
          </FormProvider>
        </SettingsSection>
      ) : (
        <Text fw="bold">
          {
            /* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */
            t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`
          }
        </Text>
      )}

      <MetabotSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
      />
    </SettingsPageWrapper>
  );
}
