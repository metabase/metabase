import { EnableEmbeddedAnalyticsCard } from "metabase-enterprise/embedding_iframe_sdk_setup/components/EnableEmbeddedAnalyticsCard";
import { EnableStaticEmbeddingCard } from "metabase-enterprise/embedding_iframe_sdk_setup/components/EnableStaticEmbeddingCard";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";

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
