import { t } from "ttag";

import type { PresenceModel, PresenceViewer } from "metabase/api";
import { usePresence } from "metabase/common/hooks/use-presence";
import { Avatar, Tooltip } from "metabase/ui";

const MAX_VISIBLE = 5;

interface PresenceAvatarStackProps {
  model: PresenceModel;
  modelId: number | undefined;
}

function viewerDisplayName(viewer: PresenceViewer): string {
  const full = [viewer.first_name, viewer.last_name]
    .filter((part) => part != null && part.length > 0)
    .join(" ");
  return full.length > 0 ? full : viewer.email;
}

function viewerInitials(viewer: PresenceViewer): string {
  const first = viewer.first_name?.[0];
  const last = viewer.last_name?.[0];
  if (first != null || last != null) {
    return `${first ?? ""}${last ?? ""}`.toUpperCase();
  }
  return viewer.email[0]?.toUpperCase() ?? "?";
}

/**
 * POC: Renders a horizontal stack of avatars for the other users currently
 * viewing the same question or dashboard. Returns null when alone.
 */
export function PresenceAvatarStack({
  model,
  modelId,
}: PresenceAvatarStackProps) {
  const viewers = usePresence(model, modelId);

  if (viewers.length === 0) {
    return null;
  }

  const visible = viewers.slice(0, MAX_VISIBLE);
  const overflow = viewers.length - visible.length;

  return (
    <Avatar.Group
      spacing="xs"
      aria-label={t`Users currently viewing this page`}
    >
      {visible.map((viewer) => (
        <Tooltip key={viewer.id} label={viewerDisplayName(viewer)}>
          <Avatar radius="xl" size="md">
            {viewerInitials(viewer)}
          </Avatar>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <Tooltip
          label={t`${overflow} more ${
            overflow === 1 ? t`person` : t`people`
          } viewing`}
        >
          <Avatar radius="xl" size="md" color="brand">
            +{overflow}
          </Avatar>
        </Tooltip>
      )}
    </Avatar.Group>
  );
}
