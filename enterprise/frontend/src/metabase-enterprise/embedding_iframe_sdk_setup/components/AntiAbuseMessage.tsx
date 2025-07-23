import { t } from "ttag";

import { Button, Card, Icon, Stack, Text } from "metabase/ui";

interface AntiAbuseMessageProps {
  onAccept: () => void;
}

export const AntiAbuseMessage = ({ onAccept }: AntiAbuseMessageProps) => {
  // eslint-disable-next-line no-literal-metabase-strings -- used in embed flow in main app
  const message = t`By using Metabase's embedding features, you agree to use them responsibly and in accordance with our terms of service. Embedding should not be used to circumvent licensing or create unauthorized redistributions.`;

  return (
    <Card
      shadow="lg"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "320px",
        zIndex: 1000,
        border: "1px solid var(--mb-color-border)",
      }}
      p="md"
    >
      <Stack gap="sm">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="info" size={16} color="var(--mb-color-text-medium)" />
          <Text size="sm" fw="bold">
            {t`Embedding Terms`}
          </Text>
        </div>

        <Text size="sm" color="text-medium">
          {message}
        </Text>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="sm" onClick={onAccept}>
            {t`OK`}
          </Button>
        </div>
      </Stack>
    </Card>
  );
};
