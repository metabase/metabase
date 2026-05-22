import cx from "classnames";
import type { MouseEvent } from "react";

import { useMetabotAgent } from "metabase/metabot/hooks";
import type { MetabotAgentId } from "metabase/metabot/state";
import { Icon, Loader } from "metabase/ui";

import S from "./MetabotBar.module.css";

interface MetabotTabProps {
  agentId: MetabotAgentId;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

export const MetabotTab = ({
  agentId,
  isActive,
  onSelect,
  onRemove,
}: MetabotTabProps) => {
  const { messages, isDoingScience } = useMetabotAgent(agentId);

  if (messages.length === 0) {
    return null;
  }

  const title = agentId;

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(S.tab, { [S.tabActive]: isActive })}
      data-testid="metabot-tab"
      data-agent-id={agentId}
      title={title}
    >
      <span className={S.tabStatus} aria-hidden>
        {isDoingScience ? (
          <Loader size={10} />
        ) : (
          <Icon name="check" size={10} c="success" />
        )}
      </span>
      <span className={S.tabTitle}>{title}</span>
      <span
        role="button"
        tabIndex={-1}
        aria-label="Close tab"
        className={S.tabClose}
        onClick={handleRemove}
      >
        <Icon name="close" size={10} />
      </span>
    </button>
  );
};
