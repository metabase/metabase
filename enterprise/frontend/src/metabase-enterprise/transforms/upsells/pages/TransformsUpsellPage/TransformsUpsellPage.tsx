import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { jt, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { DottedBackground } from "metabase/data-studio/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/data-studio/upsells/components/LineDecorator";
import { useMetadataToasts } from "metabase/metadata/hooks/useMetadataToasts";
import { EnableTransformsCard } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsCard";
import { Button, Center, Flex, Text, Title } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api/cloud-add-ons";

import { TransformsSettingUpModal } from "../../components/TransformsSettingUpModal";
import { useTransformsBilling } from "../../hooks/useTransformsBilling";

/**
 * Note: this upsell page should only be displayed to cloud customers since OSS and Self-hosted have
 * transforms enabled by default.
 */
export function TransformsUpsellPage() {
  // TODO: Pass to EnableTransformsCard
  // const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  // TODO: Check for unused props in useTransformsBilling
  const { error, hadTransforms, isLoading } = useTransformsBilling();

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
      window.location.reload();
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

  const freeUnits = 1000; // TODO: Get from api
  const freeUnitsStr = freeUnits.toLocaleString();
  const notifyThreshold = 0.8; // TODO: Get from api
  const perTransformRate = "TODO"; // TODO: Get from api

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
            leftContent={
              !shouldShowAgreement ? undefined : (
                <>
                  <Title
                    order={2}
                  >{t`${freeUnitsStr} free transform runs`}</Title>
                  <Text
                    c="text-secondary"
                    fz="1rem"
                    lh={1.4}
                  >{jt`Your cloud plan comes with ${freeUnitsStr} transform runs ${(<strong key="bold">{t`completely free`}</strong>)}. After you use your ${freeUnitsStr} runs you'll be charged ${perTransformRate} per run. You only pay for what you use.`}</Text>
                  <Text
                    c="text-secondary"
                    fz="1rem"
                    lh={1.4}
                  >{t`We'll notify you when you've hit ${notifyThreshold * 100}% of your allotment.`}</Text>
                  <Button
                    loading={isPurchasing}
                    variant="primary"
                    onClick={handlePurchase}
                  >{t`Agree and continue`}</Button>
                  <Text c="text-secondary" lh={1.4}>
                    {t`By clicking agree and continue you agree to be charged in accordance with our terms of service. Your free transforms never expire, so they'll be waiting here for you when you'r ready.`}
                  </Text>
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
          window.location.reload();
        }}
      />
    </DottedBackground>
  );
}
