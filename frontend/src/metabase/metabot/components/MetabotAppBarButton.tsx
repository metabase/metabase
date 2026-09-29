import { t } from "ttag";

import {
  useIsFullPageMetabot,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useSetting } from "metabase/settings";
import { ActionIcon, type ActionIconProps, Box, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import { trackMetabotChatOpened } from "../analytics";

import { MetabotIcon } from "./MetabotIcon";

interface MetabotAppBarButtonProps extends ActionIconProps {
  className?: string;
}

export function MetabotAppBarButton({
  className,
  ...rest
}: MetabotAppBarButtonProps) {
  const { hasMetabotAccess, isLoading } = useUserMetabotPermissions();
  const metabot = useMetabotAgent("omnibot");
  const metabotName = useSetting("metabot-name");
  const isFullPageMetabot = useIsFullPageMetabot();

  if (isLoading) {
    // Hold the button's space while permissions load, so the header controls beside it
    // don't jump sideways when it appears.
    return <Box w="2rem" h="2rem" flex="0 0 auto" aria-hidden />;
  }

  if (!hasMetabotAccess) {
    return null;
  }

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = t`Chat with ${metabotName} (${METAKEY}+E)`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        className={className}
        variant="subtle"
        c={isFullPageMetabot ? "text-disabled" : "text-primary"}
        opacity={isFullPageMetabot ? 0.5 : undefined}
        bd="1px solid var(--mb-color-border-neutral)"
        p="sm"
        h="2rem"
        w="2rem"
        aria-label={label}
        onClick={handleClick}
        {...rest}
        disabled={isFullPageMetabot}
      >
        <MetabotIcon />
      </ActionIcon>
    </Tooltip>
  );
}
