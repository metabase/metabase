import { Stack } from "metabase/ui";

import { UPSELL_CAMPAIGN_BEHAVIOR } from "../../../analytics";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { AuthenticationCard } from "../../AuthenticationCard";
import { EmbeddingUpsell } from "../../Common/EmbeddingUpsell";
import { LegacyStaticEmbeddingAlert } from "../../LegacyStaticEmbeddingAlert";

import { AppearanceCard } from "./AppearanceCard";
import { BehaviorCard } from "./BehaviorCard";
import { ParametersCard } from "./ParametersCard";

export const AppearanceStep = () => {
  const { isFirstStep } = useSdkIframeEmbedSetupContext();

  return (
    <Stack gap="md">
      {/* When the wizard is opened with a preselected resource (initialState),
          the options step is the user's first step and must show the auth
          controls so they can switch auth type or accept terms. */}
      {isFirstStep && <AuthenticationCard />}
      <BehaviorCard />
      <ParametersCard />
      <AppearanceCard />
      <LegacyStaticEmbeddingAlert />
      <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_BEHAVIOR} />
    </Stack>
  );
};
