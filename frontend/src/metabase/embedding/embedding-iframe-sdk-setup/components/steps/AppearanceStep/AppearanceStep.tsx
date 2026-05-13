import { Stack } from "metabase/ui";

import { UPSELL_CAMPAIGN_BEHAVIOR } from "../../../analytics";
import { EmbeddingUpsell } from "../../Common/EmbeddingUpsell";
import { LegacyStaticEmbeddingAlert } from "../../LegacyStaticEmbeddingAlert";

import { AppearanceCard } from "./AppearanceCard";
import { BehaviorCard } from "./BehaviorCard";
import { ParametersCard } from "./ParametersCard";

export const AppearanceStep = () => (
  <Stack gap="md">
    <BehaviorCard />
    <ParametersCard />
    <AppearanceCard />
    <LegacyStaticEmbeddingAlert />
    <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_BEHAVIOR} />
  </Stack>
);
