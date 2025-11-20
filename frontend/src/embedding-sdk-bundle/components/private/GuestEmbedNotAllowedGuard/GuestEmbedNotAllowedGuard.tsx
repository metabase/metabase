import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";

/**
 * A wrapper component that renders its children for Metabase Account embed only
 */
export const GuestEmbedNotAllowedGuard = ({ children }: PropsWithChildren) => {
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  return !isGuestEmbed ? (
    children
  ) : (
    <SdkError message={t`This component does not support Guest Embed`} />
  );
};
