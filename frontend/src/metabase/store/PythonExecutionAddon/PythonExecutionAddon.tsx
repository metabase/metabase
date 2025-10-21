import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo } from "react";
import { c, t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { UpsellPythonTransforms } from "metabase/admin/upsells/UpsellPythonTransforms";
import {
  useListAddonsQuery,
  usePurchaseCloudAddOnMutation,
} from "metabase/api";
import { useTokenRefreshUntil } from "metabase/api/utils";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { formatNumber } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import {
  Box,
  Button,
  Flex,
  Image,
  Loader,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";

export const PythonExecutionAddon = () => {
  const [isModalOpen, { open: openModal, close }] = useDisclosure(false);
  const {
    data: addOns,
    isLoading: isFetchingAddOnPrices,
    isError: failedToFetchAddOnPrices,
  } = useListAddonsQuery();
  const [purchaseCloudAddOn, response] = usePurchaseCloudAddOnMutation();

  useTokenRefreshUntil("metabot-v3", {
    intervalMs: 1000,
    skip: !response.isSuccess,
  });

  const hasPythonTransforms = useHasTokenFeature("transforms-python");

  const tokenStatus = useSetting("token-status");
  const currentUser = useSelector(getCurrentUser);

  const storeUserEmails =
    tokenStatus?.["store-users"]?.map(({ email }) => email.toLowerCase()) ?? [];
  const isStoreUser = storeUserEmails.includes(
    currentUser?.email.toLowerCase(),
  );
  const anyStoreUserEmailAddress = storeUserEmails?.[0];

  const priceInformation = useMemo(() => {
    if (!addOns) {
      return [];
    }

    const pythonAddOns = addOns.filter(
      (a) => a.product_type === "python-execution",
    );
    return pythonAddOns.map((a) => a.default_base_fee).sort();
  }, [addOns]);

  const [MONTHLY_PRICE, YEARLY_PRICE] = priceInformation;

  const formattedPrice = (price: number) =>
    formatNumber(price, {
      currency: "USD",
      number_style: "currency",
      maximumFractionDigits: 0,
    });

  const getDescription = () => {
    if (!isStoreUser) {
      // eslint-disable-next-line no-literal-metabase-strings -- only shown to admins
      return t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`;
    }

    if (isFetchingAddOnPrices) {
      return t`We're fetching the latest add-on price information. Thank you for your patience.`;
    }

    if (failedToFetchAddOnPrices) {
      // eslint-disable-next-line no-literal-metabase-strings -- only shown to admins
      return t`We couldn't fetch the add-on prices. Please try again or contact Metabase support if the issue persists.`;
    }

    return c("{0} is a monthly USD price, {1} is a yearly USD price")
      .jt`${formattedPrice(MONTHLY_PRICE)}/month (${formattedPrice(YEARLY_PRICE)}/year on the yearly plan) will be added to your next billing period. You can cancel the add-on anytime.`;
  };

  const illustration = getSubpathSafeUrl(
    "app/assets/img/python-transforms-illustration.svg",
  );

  const shouldDisablePurchase =
    !response.isUninitialized || !isStoreUser || !addOns;

  const handlePurchase = useCallback(async () => {
    await purchaseCloudAddOn({
      product_type: "python-execution",
    });
  }, [purchaseCloudAddOn]);

  useEffect(() => {
    if (hasPythonTransforms) {
      window.location.reload();
    }
  }, [hasPythonTransforms]);

  return (
    <Flex mx="auto" pt="xl" w="100%" justify="center">
      <UpsellPythonTransforms source="admin-transforms" onClick={openModal} />
      <Modal opened={isModalOpen} onClose={close}>
        <Stack
          w={360}
          m="0 auto"
          ta="center"
          gap="lg"
          align="center"
          pb={64}
          pt="md"
        >
          <Image src={illustration} w={96} />
          <Box>
            <Title order={2} size="lg" mb="sm">{t`Add Python Execution`}</Title>
            <Text lh={1.5}>{getDescription()}</Text>
          </Box>
          <Box w="100%">
            <Button
              variant="filled"
              onClick={handlePurchase}
              disabled={shouldDisablePurchase}
              mb="md"
              fullWidth
            >
              {response.isLoading || isFetchingAddOnPrices ? (
                <Loader size="sm" />
              ) : (
                t`Confirm purchase`
              )}
            </Button>
            {response.isLoading && (
              <Text fz="sm" c="text-medium">
                {t`Adding Python data transforms. This can take up to 3 minutes.`}
              </Text>
            )}
            {response.isError && (
              <Text c="error" fz="sm">
                {/* eslint-disable-next-line no-literal-metabase-strings -- only shown to admins */}
                {t`Something went wrong with the purchase. Please try again or contact Metabase support if the issue persists.`}
              </Text>
            )}
          </Box>
        </Stack>
      </Modal>
    </Flex>
  );
};
