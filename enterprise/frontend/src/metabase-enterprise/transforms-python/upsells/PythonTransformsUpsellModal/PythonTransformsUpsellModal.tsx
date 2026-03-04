import { useEffect } from "react";
import { t } from "ttag";

import { trackUpsellViewed } from "metabase/admin/upsells/components/analytics";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useStoreUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import {
  Button,
  Center,
  Divider,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useTransformsBilling } from "metabase-enterprise/transforms/upsells/hooks";

import { CloudPurchaseContent } from "./CloudPurchaseContent";
import { CAMPAIGN, LOCATION } from "./constants";

type PythonTransformsUpsellModalProps = {
  onClose: VoidFunction;
};

export function PythonTransformsUpsellModal({
  onClose,
}: PythonTransformsUpsellModalProps) {
  const bulletPoints = [
    t`Use Python to handle complex logic that's awkward or brittle in SQL`,
    t`Reuse shared Python logic instead of copying SQL patterns`,
    t`Unblock advanced use cases without pushing work into another tool`,
    t`Put pandas to work for data analysis and manipulation`,
  ];

  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const {
    isLoading,
    error,
    billingPeriodMonths,
    advancedTransformsAddOn,
    isOnTrial,
  } = useTransformsBilling();

  useEffect(() => {
    trackUpsellViewed({ location: LOCATION, campaign: CAMPAIGN });
  }, []);

  const canUserPurchase =
    isStoreUser && (!!advancedTransformsAddOn || !isHosted);
  const shouldShowRightColumn = canUserPurchase && isHosted;

  return (
    <Modal.Root
      onClose={onClose}
      opened
      size={shouldShowRightColumn ? "xl" : "md"}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Body p={0}>
          <Flex>
            {/* Left Column - Info */}
            <Stack p="3rem" flex={1} gap="md">
              <Title order={3}>
                {t`Go beyond SQL with advanced transforms`}
              </Title>
              <Text c="text-secondary" lh="lg">
                {t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`}
              </Text>
              <Stack gap="md" pb="md" pt="sm">
                {bulletPoints.map((point) => (
                  <Flex direction="row" gap="sm" key={point}>
                    <Center w={24} h={24} flex="0 0 auto">
                      <Icon name="check_filled" size={16} c="text-brand" />
                    </Center>
                    <Text c="text-secondary" lh="lg">
                      {point}
                    </Text>
                  </Flex>
                ))}
              </Stack>
              {!canUserPurchase && (
                <Text fw="bold">
                  {anyStoreUserEmailAddress
                    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                      t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
                    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                      t`Please ask a Metabase Store Admin to enable this for you.`}
                </Text>
              )}
              {canUserPurchase && !isHosted && <SelfHostedStorePurchaseLink />}
            </Stack>
            {shouldShowRightColumn && (
              <>
                <Divider orientation="vertical" />
                <Stack bg="background-secondary" flex={1} gap="lg" p="xl">
                  <Title order={3}>
                    {getRightColumnTitle(
                      isHosted && advancedTransformsAddOn?.trial_days
                        ? advancedTransformsAddOn?.trial_days
                        : 0,
                    )}
                  </Title>
                  {error || isLoading ? (
                    <Center py="xl">
                      <LoadingAndErrorWrapper
                        loading={isLoading}
                        error={
                          error
                            ? t`Error fetching information about available add-ons.`
                            : undefined
                        }
                      />
                    </Center>
                  ) : (
                    <CloudPurchaseContent
                      billingPeriod={
                        billingPeriodMonths === 1 ? "monthly" : "yearly"
                      }
                      handleModalClose={onClose}
                      isTrialFlow={isOnTrial}
                      pythonPrice={
                        advancedTransformsAddOn?.default_base_fee ?? 0
                      }
                    />
                  )}
                </Stack>
              </>
            )}
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function getRightColumnTitle(availableTrialDays: number) {
  return availableTrialDays > 0
    ? t`Start a free ${availableTrialDays}-day trial of Python transforms`
    : t`Add advanced transforms to your plan`;
}

function SelfHostedStorePurchaseLink() {
  const storeUrl = useStoreUrl("account/transforms");

  return (
    <Button component="a" href={storeUrl} variant="primary">
      {t`Go to your store account to purchase`}
    </Button>
  );
}
