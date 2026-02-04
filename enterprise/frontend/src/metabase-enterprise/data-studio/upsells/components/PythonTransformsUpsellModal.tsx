import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/admin/upsells/components/analytics";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { UPGRADE_URL } from "metabase/admin/upsells/constants";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
import { Button, Flex, Modal, Stack, Text, Title } from "metabase/ui";
import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { TransformsSettingUpModal } from "./TransformsSettingUpModal";

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
  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);
  const [settingUpModalOpened, settingUpModalHandlers] = useDisclosure(false);
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();

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

  const handleSelfHostedClick = () => {
    triggerUpsellFlow?.();
    onClose();
  };

  const handleCloudPurchase = useCallback(async () => {
    trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN });
    settingUpModalHandlers.open();
    onClose();
    try {
      await purchaseCloudAddOn({
        product_type: "python-execution",
      }).unwrap();
    } catch {
      settingUpModalHandlers.close();
    }
  }, [purchaseCloudAddOn, settingUpModalHandlers, onClose]);

  const renderContent = () => {
    if (isHosted && !isStoreUser) {
      return (
        <Text fw="bold">
          {anyStoreUserEmailAddress
            ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
              t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
            : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
              t`Please ask a Metabase Store Admin to enable this for you.`}
        </Text>
      );
    }

    if (isHosted && isStoreUser) {
      return (
        <Flex justify="flex-end">
          <Button
            variant="filled"
            size="md"
            onClick={handleCloudPurchase}
            loading={isPurchasing}
          >
            {t`Get Python transforms`}
          </Button>
        </Flex>
      );
    }

    return (
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
  };

  return (
    <>
      <Modal.Root opened={isOpen} onClose={onClose} size="md">
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header p="xl" pb="md">
            <Flex align="center" gap="sm">
              <UpsellGem size={24} />
              <Title order={3}>{t`Unlock Python transforms`}</Title>
            </Flex>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body px="xl" pb="xl">
            <Stack gap="lg">
              <Text>{t`Write powerful data transformations using Python. Access pandas, numpy, and other libraries to clean, reshape, and enrich your data. Available as an add-on for your plan.`}</Text>
              {renderContent()}
            </Stack>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      <TransformsSettingUpModal
        opened={settingUpModalOpened}
        onClose={() => {
          settingUpModalHandlers.close();
          window.location.reload();
        }}
        isPython
      />
    </>
  );
}
