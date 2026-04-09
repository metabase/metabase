import { useSetupAuthContentTranslations } from "embedding-sdk-bundle/hooks/private/use-setup-content-translations";

export const ContentTranslationsProvider = () => {
  useSetupAuthContentTranslations();

  return null;
};
