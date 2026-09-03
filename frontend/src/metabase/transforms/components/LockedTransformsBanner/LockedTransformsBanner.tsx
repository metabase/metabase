import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux/hooks";
import { getStoreUsers } from "metabase/selectors/store-users";
import { Box, Button, Flex, Stack, Text } from "metabase/ui";

export const LockedTransformsBanner = () => {
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);
  const isAdmin = useSelector(getUserIsAdmin);
  const canPurchaseTransforms = isStoreUser || isAdmin;
  const storeUrl = useStoreUrl("account/manage/plans");

  return (
    <Flex
      bg="background_page-tertiary"
      p="xl"
      mb="sm"
      bdrs="sm"
      lh="lg"
      align="center"
      justify="space-between"
    >
      <Stack gap="sm">
        <Text component="h2" fw={600} fz="1rem" lh="inherit">
          {t`You've used all the transform runs included in your trial.`}
        </Text>
        <Text c="text-secondary" lh="inherit">
          {t`To keep using transforms you can end your trial early and start your subscription.`}
        </Text>
        {!canPurchaseTransforms && (
          <Text c="text-secondary" fw="bold" lh="inherit">
            {anyStoreUserEmailAddress
              ? t`Please ask a Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
              : t`Please ask a Store Admin to enable this for you.`}
          </Text>
        )}
      </Stack>
      {canPurchaseTransforms && (
        <Box ms="lg">
          <Button
            component={ExternalLink}
            href={storeUrl}
          >{t`Start paid subscription`}</Button>
        </Box>
      )}
    </Flex>
  );
};
