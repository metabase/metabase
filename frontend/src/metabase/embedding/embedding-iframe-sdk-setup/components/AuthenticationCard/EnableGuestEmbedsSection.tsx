import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useUpdateSettingsMutation } from "metabase/settings";
import { Anchor, Button, Group, Icon, Stack, Text } from "metabase/ui";

import { UsageConditionsInfoIcon } from "./UsageConditionsInfoIcon";

interface Props {
  isEnabled: boolean;
  termsAccepted: boolean;
  isSimpleEmbedFeatureAvailable: boolean;
}

/**
 * Rendered under the Guest radio when `enable-embedding-modular` isn't on yet
 * or the AGPL usage conditions haven't been accepted. Lets the admin do both
 * in one click from inside the wizard.
 *
 * `show-static-embed-terms` is force-false on Pro (settings.clj), so the
 * "agree to the usage conditions" wording never renders there.
 */
export const EnableGuestEmbedsSection = ({
  isEnabled,
  termsAccepted,
  isSimpleEmbedFeatureAvailable,
}: Props) => {
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

  const isAccepted = isEnabled && termsAccepted;

  // Freeze visibility so the "Enabled" button state stays on screen
  // after the user enables the setting.
  const [showSection] = useState(!isAccepted);
  const initialDataRef = useRef({ isEnabled, termsAccepted });

  // Wording follows the admin settings page's labels for the same toggle
  // (EmbeddingMethodsCard.tsx).
  const failedToEnableMessage = isSimpleEmbedFeatureAvailable
    ? t`Failed to enable modular embedding`
    : t`Failed to enable embedding`;

  const handleEnable = async () => {
    try {
      await updateSettings({
        "enable-embedding-modular": true,
        ...(!termsAccepted && { "show-static-embed-terms": false }),
      });
    } catch (error) {
      sendToast({ message: failedToEnableMessage });
    }
  };

  if (!showSection) {
    return null;
  }

  const usageConditionsLink = (
    <Anchor
      key="usage-conditions"
      href="https://metabase.com/license/embedding"
      target="_blank"
    >
      {t`usage conditions`}
    </Anchor>
  );

  const { title, buttonCaption } =
    match(initialDataRef.current)
      .with({ isEnabled: false, termsAccepted: false }, () => ({
        // Never matches on Pro: `show-static-embed-terms` is force-false
        // there (settings.clj), so `termsAccepted` is always true.
        title: jt`To continue, enable embedding and agree to the ${usageConditionsLink}.`,
        buttonCaption: t`Agree and enable`,
      }))
      .with({ isEnabled: true, termsAccepted: false }, () => ({
        title: jt`Agree to the ${usageConditionsLink} to continue.`,
        buttonCaption: t`Agree and continue`,
      }))
      .with({ isEnabled: false, termsAccepted: true }, () => ({
        title: isSimpleEmbedFeatureAvailable
          ? t`Enable modular embedding to get started.`
          : t`Enable embedding to get started.`,
        buttonCaption: t`Enable and continue`,
      }))
      .otherwise(() => null) ?? {};

  if (!title) {
    return null;
  }

  return (
    <Stack
      gap={0}
      pl="xxl"
      data-testid="enable-embedding-card"
      mt="xxs"
      mb="sm"
    >
      <Text fz="md" c="text-primary">
        {title}

        {!termsAccepted && (
          <UsageConditionsInfoIcon>
            <GuestEmbedsTooltipContent />
          </UsageConditionsInfoIcon>
        )}
      </Text>

      <Group justify="flex-start" mt="xxs">
        <Button
          variant={isAccepted ? "default" : "filled"}
          onClick={handleEnable}
          size="xs"
          disabled={isAccepted}
          leftSection={isAccepted && <Icon name="check" />}
        >
          {isAccepted ? "Enabled" : buttonCaption}
        </Button>
      </Group>
    </Stack>
  );
};

const GuestEmbedsTooltipContent = () => (
  <>
    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`When you embed charts or dashboards from Metabase in your
        own application, that application isn't subject to the Affero
        General Public License that covers the rest of Metabase,
        provided you keep the Metabase logo and the "Powered by
        Metabase" visible on those embeds.`}
    </Text>

    <Text fz="sm" lh="lg">
      {t`You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.`}
    </Text>
  </>
);
