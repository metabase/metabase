import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";

export const GuestEmbedGuard = ({
  children,
  supportsGuestEmbed,
}: PropsWithChildren<{
  componentName: string;
  supportsGuestEmbed: boolean;
}>) => {
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  return isGuestEmbed && !supportsGuestEmbed ? (
    <SdkError message={t`This component does not support guest embeds`} />
  ) : (
    children
  );
};
