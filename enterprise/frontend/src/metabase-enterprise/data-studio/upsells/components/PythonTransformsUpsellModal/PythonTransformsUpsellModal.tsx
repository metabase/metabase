import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { trackUpsellViewed } from "metabase/admin/upsells/components/analytics";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import {
  Center,
  Divider,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { BillingPeriod } from "metabase-enterprise/data-studio/upsells/utils";

import { useTransformsBilling } from "../../hooks";

import { CloudPurchaseContent } from "./CloudPurchaseContent";
import { SelfHostedContent } from "./SelfHostedContent";
import { CAMPAIGN, LOCATION } from "./constants";

type PythonTransformsUpsellModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PythonTransformsUpsellModal({
  isOpen,
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

  // Track if we should force the modal open after a purchase error
  const [
    forceModalToOpen,
    { open: enableForceModalToOpen, close: disableForceModalToOpen },
  ] = useDisclosure(false);

  // Reset forceOpenAfterError when parent reopens the modal
  useEffect(() => {
    if (isOpen) {
      disableForceModalToOpen();
    }
  }, [isOpen, disableForceModalToOpen]);

  // Modal is open if parent says so OR if we're forcing it open after an error
  const modalOpen = isOpen || forceModalToOpen;

  const {
    isLoading,
    error,
    billingPeriodMonths,
    pythonProduct,
    isOnTrial,
    trialEndDate,
  } = useTransformsBilling();

  useEffect(() => {
    if (isOpen) {
      trackUpsellViewed({ location: LOCATION, campaign: CAMPAIGN });
    }
  }, [isOpen]);

  const hasData = billingPeriodMonths !== undefined && pythonProduct;
  const billingPeriod: BillingPeriod =
    billingPeriodMonths === 1 ? "monthly" : "yearly";
  const pythonPrice = pythonProduct?.default_base_fee ?? 0;

  const isTrialFlow = isOnTrial;
  const formattedTrialEndDate = trialEndDate
    ? dayjs(trialEndDate).format("MMMM D, YYYY")
    : undefined;

  const showSingleColumn = isHosted && !isStoreUser;

  const handleModalClose = useCallback(() => {
    disableForceModalToOpen();
    onClose();
  }, [onClose, disableForceModalToOpen]);

  const renderNonStoreUserContent = () => (
    <Text fw="bold">
      {anyStoreUserEmailAddress
        ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
          t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
        : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
          t`Please ask a Metabase Store Admin to enable this for you.`}
    </Text>
  );

  const renderCloudPurchaseContent = () => {
    if (error) {
      return (
        <Center py="xl">
          <LoadingAndErrorWrapper
            loading={false}
            error={t`Error fetching information about available add-ons.`}
          />
        </Center>
      );
    }

    if (isLoading) {
      return (
        <Center py="xl">
          <LoadingAndErrorWrapper loading={true} error={null} />
        </Center>
      );
    }

    // If no billing data available (e.g., product not available for this plan),
    // fall back to showing the upsell CTA
    if (!hasData) {
      return;
    }

    return (
      <CloudPurchaseContent
        billingPeriod={billingPeriod}
        formattedTrialEndDate={formattedTrialEndDate}
        handleModalClose={handleModalClose}
        isTrialFlow={isTrialFlow}
        onError={enableForceModalToOpen}
        pythonPrice={pythonPrice}
      />
    );
  };

  const renderRightColumnContent = () => {
    if (!isHosted) {
      return <SelfHostedContent handleModalClose={handleModalClose} />;
    }

    return renderCloudPurchaseContent();
  };

  return (
    <Modal.Root
      opened={modalOpen}
      onClose={handleModalClose}
      size={showSingleColumn ? "md" : "xl"}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Body p={0}>
          <Flex>
            {/* Left Column - Info */}
            <Stack gap="lg" p="xl" flex={1}>
              <Title
                order={2}
              >{t`Go beyond SQL with advanced transforms`}</Title>
              <Text c="text-secondary">
                {t`Run Python-based transforms alongside SQL to handle more complex logic and data workflows.`}
              </Text>
              <Stack gap="lg" py="sm">
                {bulletPoints.map((point) => (
                  <Flex direction="row" gap="sm" key={point}>
                    <Center w={24} h={24}>
                      <Icon name="check_filled" size={16} c="text-brand" />
                    </Center>
                    <Text c="text-secondary">{point}</Text>
                  </Flex>
                ))}
              </Stack>
              {showSingleColumn && renderNonStoreUserContent()}
            </Stack>
            {/* Right Column - Purchase Card (hidden for non-store users) */}
            {!showSingleColumn && (
              <>
                <Divider orientation="vertical" />
                <Stack bg="background-secondary" flex={1} gap="lg" p="xl">
                  <Title
                    order={3}
                  >{t`Add advanced transforms to your plan`}</Title>
                  {renderRightColumnContent()}
                </Stack>
              </>
            )}
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
