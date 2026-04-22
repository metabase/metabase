import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { jt, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { DottedBackground } from "metabase/data-studio/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/data-studio/upsells/components/LineDecorator";
import { useMetadataToasts } from "metabase/metadata/hooks/useMetadataToasts";
import { getStoreUsers } from "metabase/selectors/store-users";
import { EnableTransformsCard } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsCard";
import { Button, Center, Flex, Text, Title } from "metabase/ui";
import { reload } from "metabase/utils/dom";
import { useSelector } from "metabase/utils/redux";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api/cloud-add-ons";

import { TransformsSettingUpModal } from "../../components/TransformsSettingUpModal";
import { useTransformsBilling } from "../../hooks/useTransformsBilling";

const NOTIFICATION_THRESHOLD = 0.8;

/**
 * Note: this upsell page should only be displayed to cloud customers since OSS and Self-hosted
 * do not need to pay extra for basic transforms.
 */
export function TransformsUpsellPage() {
  const { error, hadTransforms, isLoading, basicTransformsAddOn } =
    useTransformsBilling();
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const { sendErrorToast } = useMetadataToasts();
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();
  const handlePurchase = useCallback(async () => {
    settingUpModalHandlers.open();
    try {
      await purchaseCloudAddOn({
        product_type: "transforms-basic-metered",
      }).unwrap();
      reload();
    } catch {
      settingUpModalHandlers.close();
      sendErrorToast(
        t`It looks like something went wrong. Please refresh the page and try again.`,
      );
    }
  }, [purchaseCloudAddOn, sendErrorToast, settingUpModalHandlers]);

  const [shouldShowAgreement, setShouldShowAgreement] = useState(false);
  const onEnableClick = () => {
    if (hadTransforms) {
      handlePurchase();
      return;
    }
    setShouldShowAgreement(true);
  };

  if (error || isLoading) {
    return (
      <DottedBackground px="3.5rem" pb="2rem">
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
          }
        />
        <Center h="100%" bg="background-secondary">
          <LoadingAndErrorWrapper
            loading={isLoading}
            error={
              error
                ? t`Error fetching information about available add-ons.`
                : null
            }
          />
        </Center>
      </DottedBackground>
    );
  }

  const freeUnitsStr = basicTransformsAddOn?.free_units?.toLocaleString();
  const perRunStr =
    basicTransformsAddOn?.default_price_per_unit != null &&
    `${basicTransformsAddOn.default_price_per_unit * 100}¢`;

  return (
    <DottedBackground
      px="3.5rem"
      pb="2rem"
      style={{ display: "flex", flexDirection: "column" }}
    >
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Flex justify="center" pos="relative" flex={1} mt="lg">
        <LineDecorator pos="absolute" mah="100%">
          <EnableTransformsCard
            onEnableClick={onEnableClick}
            permissionsErrorMessage={
              !isStoreUser && (
                <Text fz="1rem" fw="bold">
                  {t`To enable Transforms, please contact a store administrator`}
                  {anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`}
                  .
                </Text>
              )
            }
            finePrint={
              hadTransforms &&
              t`By clicking Enable transforms, you agree to be charged ${perRunStr} per successful transform run.`
            }
            leftContent={
              !shouldShowAgreement ? undefined : (
                <>
                  {perRunStr && freeUnitsStr ? (
                    <>
                      <Title
                        order={2}
                      >{t`${freeUnitsStr} free transform runs`}</Title>
                      <Text c="text-secondary" fz="1rem" lh={1.4}>
                        {jt`Your Cloud plan comes with ${freeUnitsStr} transform runs ${(
                          <strong key="bold">{t`completely free`}.</strong>
                        )}`}{" "}
                        {t`After you use your ${freeUnitsStr} runs, you'll be charged ${perRunStr} per run. You only pay for what you use.`}
                      </Text>
                      <Text
                        c="text-secondary"
                        fz="1rem"
                        lh={1.4}
                      >{t`We'll notify you when you've hit ${NOTIFICATION_THRESHOLD * 100}% of your allotment.`}</Text>
                      <Button
                        loading={isPurchasing}
                        variant="primary"
                        onClick={handlePurchase}
                      >{t`Agree and continue`}</Button>
                      <Text c="text-secondary" lh={1.4}>
                        {t`By clicking agree and continue, you agree to be charged in accordance with our terms of service. Your free transforms never expire, so they'll be waiting here for you when you're ready.`}
                      </Text>
                    </>
                  ) : (
                    <Text>{t`Error fetching information about available add-ons.`}</Text>
                  )}
                </>
              )
            }
          />
        </LineDecorator>
      </Flex>
      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          reload();
        }}
      />
    </DottedBackground>
  );
}
