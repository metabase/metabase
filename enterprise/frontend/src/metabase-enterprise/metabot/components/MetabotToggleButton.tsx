import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { trackMetabotChatOpened } from "../analytics";

interface MetabotToggleButtonProps {
  className?: string;
}

export function MetabotToggleButton({ className }: MetabotToggleButtonProps) {
  const metabot = useMetabotAgent();

  const handleClick = () => {
    if (!metabot.visible) {
      trackMetabotChatOpened("native_editor");
    }

    metabot.setVisible(!metabot.visible);
  };

  const label = metabot.visible ? t`Close Metabot chat` : t`Open Metabot chat`;

  return (
    <Tooltip label={label}>
      <Button
        className={className}
        variant="subtle"
        p={0}
        h="fit-content"
        bd="none"
        leftSection={<Icon name="metabot" />}
        aria-label={label}
        onClick={handleClick}
      />
    </Tooltip>
  );
}
