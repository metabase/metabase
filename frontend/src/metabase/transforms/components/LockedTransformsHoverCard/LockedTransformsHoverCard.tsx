import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/redux/hooks";
import { getStoreUsers } from "metabase/selectors/store-users";
import { Button, HoverCard, Text } from "metabase/ui";

export const LockedTransformsHoverCard = ({ children }: PropsWithChildren) => {
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);
  const storeUrl = useStoreUrl("account/manage/plans");

  return (
    <HoverCard
      width="20rem"
      closeDelay={100}
      openDelay={100}
      position="bottom-end"
    >
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown p="lg" data-testid="locked-transforms-hover-card">
        <Text fw="bold" lh="inherit">
          {t`You've used all the transform runs included in your trial.`}
        </Text>
        <Text lh="inherit" mt="sm" c="text-secondary">
          {t`To keep using transforms you can end your trial early and start your subscription.`}
        </Text>
        {!isStoreUser ? (
          <Text lh="inherit" mt="sm" c="text-secondary" fw="bold">
            {anyStoreUserEmailAddress
              ? t`Please ask a Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
              : t`Please ask a Store Admin to enable this for you.`}
          </Text>
        ) : (
          <Button
            component={ExternalLink}
            href={storeUrl}
            fullWidth
            mt="md"
          >{t`Start paid subscription`}</Button>
        )}
      </HoverCard.Dropdown>
    </HoverCard>
  );
};
