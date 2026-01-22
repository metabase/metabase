import { EnableEmbeddedAnalyticsCard } from "metabase/embedding/embedding-iframe-sdk-setup/components/EnableEmbeddedAnalyticsCard";
import { EnableGuestEmbedsCard } from "metabase/embedding/embedding-iframe-sdk-setup/components/EnableGuestEmbedsCard";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

export const SdkIframeStepEnableEmbeddingSection = () => {
  const { isSimpleEmbedFeatureAvailable, currentStep, settings } =
    useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const rerenderKey = currentStep;

  if (isGuestEmbed) {
    return <EnableGuestEmbedsCard key={rerenderKey} />;
  }

  return isSimpleEmbedFeatureAvailable ? (
    <EnableEmbeddedAnalyticsCard key={rerenderKey} />
  ) : null;
};
