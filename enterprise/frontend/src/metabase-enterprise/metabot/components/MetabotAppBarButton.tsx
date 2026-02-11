import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackMetabotChatOpened } from "../analytics";

interface MetabotAppBarButtonProps extends ActionIconProps {
  className?: string;
}

export function MetabotAppBarButton({
  className,
  ...rest
}: MetabotAppBarButtonProps) {
  const metabot = useMetabotAgent("omnibot");

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = t`Chat with Metabot (${METAKEY}+E)`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        className={className}
        variant="subtle"
        c="text-primary"
        bd="1px solid var(--mb-color-border)"
        p="sm"
        h="2.25rem"
        w="2.25rem"
        aria-label={label}
        onClick={handleClick}
        {...rest}
      >
        <Icon name="metabot" />
      </ActionIcon>
    </Tooltip>
  );
}
