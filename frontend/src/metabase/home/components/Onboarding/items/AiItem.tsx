import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

export const AiItem = ({ itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);

  return (
    <ChecklistItem
      value="ai"
      icon="metabot"
      label={t`Set up AI (optional)`}
      itemRef={itemRef}
      actions={[
        { label: t`Set up MCP`, to: "/admin/metabot/mcp", cta: "primary" },
      ]}
    >
      <ChecklistImage
        alt={t`Connecting an AI provider in the admin settings`}
        src="app/assets/img/onboarding_ai.png"
        srcSet="app/assets/img/onboarding_ai@2x.png 2x"
      />
      <Text>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase CLI" is a product name, not the instance name */}
        {t`You can use AI to explore your data in ${applicationName} three ways: ask Metabot directly in the ${applicationName} app, connect external AI tools via the MCP server, or drive development workflows with AI using the Metabase CLI.`}
      </Text>
    </ChecklistItem>
  );
};
