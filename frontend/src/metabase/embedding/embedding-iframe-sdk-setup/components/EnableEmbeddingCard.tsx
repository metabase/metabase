import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  Anchor,
  Button,
  Group,
  HoverCard,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import type { EnterpriseSettings } from "metabase-types/api";

interface EmbeddingControlCardProps {
  embeddingType: string;
  isEnabled: boolean;
  termsAccepted: boolean;
  settingsToUpdate: Partial<EnterpriseSettings>;
  errorMessage: string;
}

export const EnableEmbeddingCard = ({
  embeddingType,
  isEnabled,
  termsAccepted,
  settingsToUpdate,
  errorMessage,
}: EmbeddingControlCardProps) => {
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

  const isAccepted = isEnabled && termsAccepted;

  // Freeze the card visibility to show even when we enabled the embedding setting.
  // This allows us to show the "Enabled" button state and not hide the card.
  const [showCard] = useState(!isAccepted);

  const handleEnableEmbedding = async () => {
    try {
      await updateSettings(settingsToUpdate);
    } catch (error) {
      sendToast({ message: errorMessage });
    }
  };

  const initialDataRef = useRef({ isEnabled, termsAccepted });

  if (!showCard) {
    return null;
  }

  const data = match(initialDataRef.current)
    .with(
      {
        isEnabled: false,
        termsAccepted: false,
      },
      () => ({
        title:
          embeddingType === "guest embeds"
            ? jt`To continue, enable ${embeddingType} and agree to the ${(
                <Anchor
                  key="usage-conditions"
                  href="https://metabase.com/license/embedding"
                  target="_blank"
                >
                  {t`usage conditions`}
                </Anchor>
              )}.`
            : t`To continue, enable ${embeddingType} and agree to the usage conditions.`,
        buttonCaption: t`Agree and enable`,
      }),
    )
    .with(
      {
        isEnabled: true,
        termsAccepted: false,
      },
      () => ({
        title:
          embeddingType === "guest embeds"
            ? jt`Agree to the ${(
                <Anchor
                  key="usage-conditions"
                  href="https://metabase.com/license/embedding"
                  target="_blank"
                >
                  {t`usage conditions`}
                </Anchor>
              )} to continue.`
            : t`Agree to the usage conditions to continue.`,
        buttonCaption: t`Agree and continue`,
      }),
    )
    .with(
      {
        isEnabled: false,
        termsAccepted: true,
      },
      () => ({
        title: t`Enable ${embeddingType} to get started.`,
        buttonCaption: t`Enable and continue`,
      }),
    )
    .otherwise(() => null);

  if (!data) {
    return null;
  }

  const { title, buttonCaption } = data;

  return (
    <Stack gap={0} data-testid="enable-embedding-card">
      <Text fz="md" c="text-primary">
        {title}

        {!termsAccepted && (
          <HoverCard position="bottom" withArrow>
            <HoverCard.Target>
              <Icon
                name="info"
                size={14}
                c="text-secondary"
                ml="sm"
                style={{ verticalAlign: "middle" }}
              />
            </HoverCard.Target>

            <HoverCard.Dropdown>
              <Stack maw={340} p="md" gap="md">
                {embeddingType === "guest embeds" ? (
                  <>
                    <Text fz="sm" lh="lg">
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- User facing text */}
                      {t`When you embed charts or dashboards from Metabase in your
                        own application that application isn't subject to the Affero
                        General Public License that covers the rest of Metabase,
                        provided you keep the Metabase logo and the "Powered by
                        Metabase" visible on those embeds.`}
                    </Text>

                    <Text fz="sm" lh="lg">
                      {t`You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text fz="sm" lh="lg">
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- User facing text */}
                      {t`When using modular embedding, each end user must have their own Metabase account.`}
                    </Text>

                    <Text fz="sm" lh="lg">
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- User facing text */}
                      {t`Sharing Metabase accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`}
                    </Text>

                    <Text fz="sm" lh="lg">
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- User facing text */}
                      {t`That, and we consider shared accounts to be unfair usage. Fair usage involves giving each end-user of the embedded analytics their own Metabase account.`}
                    </Text>
                  </>
                )}
              </Stack>
            </HoverCard.Dropdown>
          </HoverCard>
        )}
      </Text>

      <Group justify="flex-end" mt="md">
        <Button
          variant={isAccepted ? "default" : "filled"}
          onClick={handleEnableEmbedding}
          disabled={isAccepted}
          leftSection={isAccepted && <Icon name="check" />}
        >
          {isAccepted ? "Enabled" : buttonCaption}
        </Button>
      </Group>
    </Stack>
  );
};
