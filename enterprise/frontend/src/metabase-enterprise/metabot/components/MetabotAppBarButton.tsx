import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { METAKEY } from "metabase/lib/browser";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackMetabotChatOpened } from "../analytics";

import { SIDEBAR_USE_CASES } from "./Metabot";

interface MetabotAppBarButtonProps extends ActionIconProps {
  className?: string;
}

export function MetabotAppBarButton({
  className,
  ...rest
}: MetabotAppBarButtonProps) {
  const metabot = useMetabotAgent();
  const enabledUseCases = useSetting("metabot-enabled-use-cases");
  const hasSidebarUseCase = SIDEBAR_USE_CASES.some((useCase) =>
    enabledUseCases?.includes(useCase),
  );

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("header");
    }

    metabot.setVisible(!metabot.visible);
  };

  if (!hasSidebarUseCase) {
    return null;
  }

  const label = t`Chat with Metabot (${METAKEY}+E)`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        className={className}
        variant="subtle"
        c="var(--mb-color-text-primary)"
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
