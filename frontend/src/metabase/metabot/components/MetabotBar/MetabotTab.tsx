import cx from "classnames";
import type { MouseEvent } from "react";

import { useMetabotAgent } from "metabase/metabot/hooks";
import type { MetabotAgentId } from "metabase/metabot/state";
import { Icon } from "metabase/ui";

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
  const { messages, isDoingScience, title } = useMetabotAgent(agentId);

  if (messages.length === 0) {
    return null;
  }

  const lastAgentMessage = [...messages]
    .reverse()
    .find((m) => m.role === "agent");
  const hasError = lastAgentMessage?.type === "turn_errored";

  const dotStatus = isDoingScience ? "pending" : hasError ? "error" : "success";

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
        <span
          className={cx(S.statusDot, {
            [S.statusDotSuccess]: dotStatus === "success",
            [S.statusDotError]: dotStatus === "error",
            [S.statusDotPending]: dotStatus === "pending",
          })}
        />
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
