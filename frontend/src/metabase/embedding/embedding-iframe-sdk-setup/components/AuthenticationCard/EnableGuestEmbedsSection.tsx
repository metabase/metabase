import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Anchor, Button, Group, Icon, Stack, Text } from "metabase/ui";

import { UsageConditionsInfoIcon } from "./UsageConditionsInfoIcon";

interface Props {
  isEnabled: boolean;
  termsAccepted: boolean;
}

/**
 * Rendered under the Guest radio when guest embeds (`enable-embedding-static`)
 * aren't enabled yet or the AGPL usage conditions haven't been accepted. Lets
 * the admin enable the feature and accept the terms in a single click from
 * inside the wizard.
 */
export const EnableGuestEmbedsSection = ({
  isEnabled,
  termsAccepted,
}: Props) => {
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

  const isAccepted = isEnabled && termsAccepted;

  // Freeze visibility so the "Enabled" button state stays on screen
  // after the user enables the setting.
  const [showSection] = useState(!isAccepted);
  const initialDataRef = useRef({ isEnabled, termsAccepted });

  const handleEnable = async () => {
    try {
      await updateSettings({
        "enable-embedding-static": true,
        ...(!termsAccepted && { "show-static-embed-terms": false }),
      });
    } catch (error) {
      sendToast({ message: t`Failed to enable guest embeds` });
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
        title: jt`To continue, enable guest embeds and agree to the ${usageConditionsLink}.`,
        buttonCaption: t`Agree and enable`,
      }))
      .with({ isEnabled: true, termsAccepted: false }, () => ({
        title: jt`Agree to the ${usageConditionsLink} to continue.`,
        buttonCaption: t`Agree and continue`,
      }))
      .with({ isEnabled: false, termsAccepted: true }, () => ({
        title: t`Enable guest embeds to get started.`,
        buttonCaption: t`Enable and continue`,
      }))
      .otherwise(() => null) ?? {};

  if (!title) {
    return null;
  }

  return (
    <Stack gap={0} pl="xl" data-testid="enable-embedding-card" mt="xs" mb="sm">
      <Text fz="md" c="text-primary">
        {title}

        {!termsAccepted && (
          <UsageConditionsInfoIcon>
            <GuestEmbedsTooltipContent />
          </UsageConditionsInfoIcon>
        )}
      </Text>

      <Group justify="flex-start" mt="xs">
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
