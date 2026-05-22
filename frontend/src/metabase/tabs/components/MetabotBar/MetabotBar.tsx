import { t } from "ttag";

import { useMetabotAgent } from "metabase/metabot/hooks/use-metabot-agent";
import { Button, Icon } from "metabase/ui";

import S from "./MetabotBar.module.css";

export function MetabotBar() {
  const { visible, setVisible } = useMetabotAgent("omnibot");

  const handleClick = () => {
    setVisible(!visible);
  };

  return (
    <div className={S.bar}>
      <Button
        size="xs"
        variant="subtle"
        className={S.button}
        leftSection={<Icon name="metabot" size={14} />}
        onClick={handleClick}
      >
        {t`Ask Metabot`}
      </Button>
    </div>
  );
}
