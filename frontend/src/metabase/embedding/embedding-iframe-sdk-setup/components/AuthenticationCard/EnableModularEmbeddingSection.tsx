import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Button, Group, Icon, Stack, Text } from "metabase/ui";

import { UsageConditionsInfoIcon } from "./UsageConditionsInfoIcon";

interface Props {
  isEnabled: boolean;
  termsAccepted: boolean;
}

/**
 * Rendered under the SSO radio when modular embedding
 * (`enable-embedding-simple`) isn't enabled yet or its terms haven't been
 * accepted. Lets the admin enable the feature and accept the terms in a
 * single click from inside the wizard.
 */
export const EnableModularEmbeddingSection = ({
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
        "enable-embedding-simple": true,
        ...(!termsAccepted && { "show-simple-embed-terms": false }),
      });
    } catch (error) {
      sendToast({ message: t`Failed to enable modular embedding` });
    }
  };

  if (!showSection) {
    return null;
  }

  const { title, buttonCaption } =
    match(initialDataRef.current)
      .with({ isEnabled: false, termsAccepted: false }, () => ({
        title: t`To continue, enable modular embedding and agree to the usage conditions.`,
        buttonCaption: t`Agree and enable`,
      }))
      .with({ isEnabled: true, termsAccepted: false }, () => ({
        title: t`Agree to the usage conditions to continue.`,
        buttonCaption: t`Agree and continue`,
      }))
      .with({ isEnabled: false, termsAccepted: true }, () => ({
        title: t`Enable modular embedding to get started.`,
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
            <ModularEmbeddingTooltipContent />
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

const ModularEmbeddingTooltipContent = () => (
  <>
    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`When using modular embedding, each end user must have their own Metabase account.`}
    </Text>

    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`Sharing Metabase accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`}
    </Text>

    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`That, and we consider shared accounts to be unfair usage. Fair usage involves giving each end-user of the embedded analytics their own Metabase account.`}
    </Text>
  </>
);
