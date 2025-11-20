import { EnableEmbeddedAnalyticsCard } from "metabase/embedding/embedding-iframe-sdk-setup/components/EnableEmbeddedAnalyticsCard";
import { EnableStaticEmbeddingCard } from "metabase/embedding/embedding-iframe-sdk-setup/components/EnableStaticEmbeddingCard";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

export const SdkIframeStepHeader = () => {
  const { isSimpleEmbedFeatureAvailable, currentStep } =
    useSdkIframeEmbedSetupContext();

  const rerenderKey = currentStep;

  return isSimpleEmbedFeatureAvailable ? (
    <EnableEmbeddedAnalyticsCard key={rerenderKey} />
  ) : (
    <EnableStaticEmbeddingCard key={rerenderKey} />
  );
};
