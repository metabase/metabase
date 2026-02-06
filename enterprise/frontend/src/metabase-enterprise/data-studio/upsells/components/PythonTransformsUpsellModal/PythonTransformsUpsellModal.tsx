import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/admin/upsells/components/analytics";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { UPGRADE_URL } from "metabase/admin/upsells/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
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

import { useTransformsBilling } from "../../hooks";

import { CloudPurchaseContent } from "./CloudPurchaseContent";
import S from "./PythonTransformsUpsellModal.module.css";

const CAMPAIGN = "data-studio-python-transforms";
const LOCATION = "data-studio-transforms";

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

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  const upsellUrl = useUpsellLink({
    url: UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  useEffect(() => {
    if (isOpen) {
      trackUpsellViewed({ location: LOCATION, campaign: CAMPAIGN });
    }
  }, [isOpen]);

  const hasData = billingPeriodMonths !== undefined && pythonProduct;
  const billingPeriod = billingPeriodMonths === 1 ? t`month` : t`year`;
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

  const handleSelfHostedClick = () => {
    trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN });
    triggerUpsellFlow?.();
    handleModalClose();
  };

  const renderNonStoreUserContent = () => (
    <Text fw="bold">
      {anyStoreUserEmailAddress
        ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
          t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
        : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
          t`Please ask a Metabase Store Admin to enable this for you.`}
    </Text>
  );

  const renderSelfHostedContent = () => (
    <Flex justify="flex-end">
      <UpsellCta
        onClick={handleSelfHostedClick}
        url={upsellUrl}
        internalLink={undefined}
        buttonText={t`Get Python transforms`}
        onClickCapture={() =>
          trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN })
        }
        size="large"
      />
    </Flex>
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
      return renderSelfHostedContent();
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
      return renderSelfHostedContent();
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
          <Flex className={S.container}>
            {/* Left Column - Info */}
            <Stack gap="lg" className={S.leftColumn} p="xl">
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
                <Stack gap="lg" className={S.rightColumn} p="xl">
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
