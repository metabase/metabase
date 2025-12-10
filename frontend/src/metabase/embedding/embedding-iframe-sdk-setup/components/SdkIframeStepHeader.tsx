import { EnableEmbeddedAnalyticsCard } from "metabase/embedding/embedding-iframe-sdk-setup/components/EnableEmbeddedAnalyticsCard";
import { EnableGuestEmbedsCard } from "metabase/embedding/embedding-iframe-sdk-setup/components/EnableGuestEmbedsCard";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

export const SdkIframeStepHeader = () => {
  const { isSimpleEmbedFeatureAvailable, currentStep } =
    useSdkIframeEmbedSetupContext();

  const rerenderKey = currentStep;

  return isSimpleEmbedFeatureAvailable ? (
    <EnableEmbeddedAnalyticsCard key={rerenderKey} />
  ) : (
    <EnableGuestEmbedsCard key={rerenderKey} />
  );
};
