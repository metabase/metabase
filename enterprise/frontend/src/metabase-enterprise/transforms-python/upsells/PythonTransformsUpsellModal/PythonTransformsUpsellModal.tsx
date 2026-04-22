import { useEffect } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackUpsellViewed } from "metabase/common/components/upsells/components/analytics";
import { useStoreUrl } from "metabase/common/hooks";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import {
  Button,
  Center,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import { useTransformsBilling } from "metabase-enterprise/transforms/upsells/hooks";

import { PurchaseAdvancedTransforms } from "./PurchaseAdvancedTransforms";
import { CAMPAIGN, LOCATION } from "./constants";

type PythonTransformsUpsellModalProps = {
  onClose: VoidFunction;
};

export function PythonTransformsUpsellModal({
  onClose,
}: PythonTransformsUpsellModalProps) {
  const bulletPoints = [
    t`Use Python to handle complex logic that's awkward or brittle in SQL`,
    t`Use the transform inspector to inspect the output of transforms to verify your logic`,
    t`Unblock advanced use cases without pushing work into another tool`,
    t`Put pandas to work for data analysis and manipulation`,
  ];

  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const { isLoading, error, advancedTransformsAddOn, hadAdvancedTransforms } =
    useTransformsBilling();

  useEffect(() => {
    trackUpsellViewed({ location: LOCATION, campaign: CAMPAIGN });
  }, []);

  const shouldShowLeftColumn = isStoreUser && isHosted;

  return (
    <Modal.Root
      onClose={onClose}
      opened
      size={shouldShowLeftColumn ? "xl" : "md"}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Body p={0}>
          {isLoading || error ? (
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
            <Flex>
              {shouldShowLeftColumn && (
                <Stack flex="0 0 56%" gap="lg" p="3rem">
                  <Title order={3}>
                    {t`Go beyond SQL with advanced transforms`}
                  </Title>
                  <Text c="text-secondary" lh="lg">
                    {t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`}{" "}
                    {t`Use the transform inspector to verify output output to verify it.`}
                  </Text>
                  {!advancedTransformsAddOn ? (
                    <Text>
                      {t`Error fetching information about available add-ons.`}
                    </Text>
                  ) : (
                    <PurchaseAdvancedTransforms
                      handleModalClose={onClose}
                      addOn={advancedTransformsAddOn}
                      freeUnitsIncluded={!hadAdvancedTransforms}
                    />
                  )}
                </Stack>
              )}
              {/* Right Column - Info */}
              <Stack
                p={shouldShowLeftColumn ? "3rem 1.5rem" : "3rem"}
                flex={1}
                gap="md"
                bg={shouldShowLeftColumn ? "background-secondary" : undefined}
              >
                {!shouldShowLeftColumn && (
                  <>
                    <Title order={3}>
                      {t`Go beyond SQL with advanced transforms`}
                    </Title>
                    <Text c="text-secondary" lh="lg" mb="sm">
                      {t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`}
                    </Text>
                  </>
                )}
                <Stack gap="md" mb="sm">
                  {bulletPoints.map((point) => (
                    <Flex direction="row" gap="sm" key={point}>
                      <Center w={24} h={24} flex="0 0 auto">
                        <Icon name="check_filled" size={16} c="brand" />
                      </Center>
                      <Text c="text-secondary" lh="lg">
                        {point}
                      </Text>
                    </Flex>
                  ))}
                </Stack>
                {!isStoreUser && (
                  <Text fw="bold" lh="md">
                    {anyStoreUserEmailAddress
                      ? t`Please ask a Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
                      : t`Please ask a Store Admin to enable this for you.`}
                  </Text>
                )}
                {isStoreUser && !isHosted && <SelfHostedStorePurchaseLink />}
              </Stack>
            </Flex>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function SelfHostedStorePurchaseLink() {
  const storeUrl = useStoreUrl("account/transforms");

  return (
    <Button component="a" href={storeUrl} variant="primary">
      {t`Go to your store account to upgrade`}
    </Button>
  );
}
