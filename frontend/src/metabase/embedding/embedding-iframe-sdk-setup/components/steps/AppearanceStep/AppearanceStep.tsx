import cx from "classnames";

import CS from "metabase/css/core/index.css";
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
  const {
    isFirstStep,
    isSimpleEmbedFeatureAvailable,
    allowPreviewAndNavigation,
  } = useSdkIframeEmbedSetupContext();

  // When the wizard lands directly on this step (initialState) on a Pro
  // instance, the user needs to configure auth first — dim the option cards
  // so the AuthenticationCard above takes focus. `allowPreviewAndNavigation`
  // tracks the terms/enablement state of whichever auth type (SSO or Guest) is
  // currently selected, so accepting the Guest terms un-dims the cards without
  // forcing the user through the SSO flow.
  const isDimmed =
    isFirstStep && isSimpleEmbedFeatureAvailable && !allowPreviewAndNavigation;
  const dimmedProps = {
    opacity: isDimmed ? 0.5 : 1,
    className: cx(isDimmed && CS.pointerEventsNone),
  };

  return (
    <Stack gap="md">
      {/* When the wizard is opened with a preselected resource (initialState),
          the options step is the user's first step and must show the auth
          controls so they can switch auth type or accept terms. */}
      {isFirstStep && <AuthenticationCard />}
      <Stack gap="md" {...dimmedProps}>
        <BehaviorCard />
        <ParametersCard />
        <AppearanceCard />
      </Stack>
      <LegacyStaticEmbeddingAlert />
      <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_BEHAVIOR} />
    </Stack>
  );
};
