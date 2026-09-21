import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import { useAiProviderModal } from "../AiProviderModal";
import type { ChecklistImageStyles } from "../ChecklistItem";
import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

const ILLUSTRATION_STYLE: ChecklistImageStyles = {
  "--leaf-x": -1,
  "--leaf-y": 10,
  "--leaf-h": 293,
};

export const AiItem = ({ value, itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);
  const openProviderModal = useAiProviderModal();

  return (
    <ChecklistItem
      value={value}
      itemRef={itemRef}
      icon="metabot"
      label={t`Set up AI (optional)`}
      actions={[
        {
          label: t`Connect to an AI provider`,
          onClick: openProviderModal,
          cta: "primary",
        },
        { label: t`Set up MCP`, to: "/admin/metabot/mcp", cta: "secondary" },
      ]}
    >
      <ChecklistImage
        alt={t`Connecting an AI provider in the admin settings`}
        src="app/assets/img/onboarding_ai.png"
        srcSet="app/assets/img/onboarding_ai@2x.png 2x"
        style={ILLUSTRATION_STYLE}
      />
      <Text>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase CLI" is a product name, not the instance name */}
        {t`You can use AI to explore your data in ${applicationName} three ways: ask Metabot directly in the ${applicationName} app, connect external AI tools via the MCP server, or drive development workflows with AI using the Metabase CLI.`}
      </Text>
    </ChecklistItem>
  );
};
