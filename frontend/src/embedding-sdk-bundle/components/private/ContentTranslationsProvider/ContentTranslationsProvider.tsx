import type { PropsWithChildren } from "react";

import { useSetupAuthContentTranslations } from "embedding-sdk-bundle/hooks/private/use-setup-content-translations";

export const ContentTranslationsProvider = ({
  children,
}: PropsWithChildren) => {
  useSetupAuthContentTranslations();

  return <>{children}</>;
};
