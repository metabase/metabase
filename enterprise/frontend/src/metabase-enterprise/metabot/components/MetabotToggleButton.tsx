import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

interface MetabotToggleButtonProps {
  className?: string;
}

export function MetabotToggleButton({ className }: MetabotToggleButtonProps) {
  const metabot = useMetabotAgent();

  const handleClick = () => {
    metabot.setVisible(!metabot.visible);
  };

  return (
    <Tooltip label={t`Open Metabot chat`}>
      <Button
        className={className}
        variant="subtle"
        p={0}
        h="fit-content"
        bd="none"
        leftSection={<Icon name="metabot" />}
        aria-label={t`Open Metabot chat`}
        onClick={handleClick}
      />
    </Tooltip>
  );
}
