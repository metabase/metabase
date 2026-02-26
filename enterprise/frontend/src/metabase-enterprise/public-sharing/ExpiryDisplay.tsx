import { t } from "ttag";

import type { ExpiryDisplayProps } from "metabase/plugins/oss/public-sharing";
import { Text } from "metabase/ui";

function formatTimeRemaining(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diffMs = expiry - now;

  if (diffMs <= 0) {
    return t`Expired`;
  }

  const diffMinutes = Math.ceil(diffMs / (1000 * 60));

  if (diffMinutes < 60) {
    return t`Expires in ${diffMinutes} minute(s)`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t`Expires in ${diffHours} hour(s)`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return t`Expires in ${diffDays} day(s)`;
}

export const ExpiryDisplay = ({ expiresAt, expired }: ExpiryDisplayProps) => {
  if (expired) {
    return (
      <Text size="sm" c="error" mt="xs">
        {t`This public link has expired.`}
      </Text>
    );
  }

  if (!expiresAt) {
    return null;
  }

  const text = formatTimeRemaining(expiresAt);
  const isExpired = new Date(expiresAt).getTime() <= Date.now();

  return (
    <Text size="sm" c={isExpired ? "error" : "text-secondary"} mt="xs">
      {text}
    </Text>
  );
};
