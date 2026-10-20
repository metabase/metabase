import { createContext, useContext } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import S from "./InsightsToggle.module.css";

type InsightsToggleState = {
  isOpen: boolean;
  onToggle: () => void;
  /** The button is hovered, so the side panel can show it's the one. */
  onHint: (isHinted: boolean) => void;
};

/** Null outside an analysis's charts, which hides the toggle. */
export const InsightsToggleContext = createContext<InsightsToggleState | null>(
  null,
);

/** The button at the top right of each chart that shows and hides insights. */
export const InsightsToggle = () => {
  const state = useContext(InsightsToggleContext);
  if (state === null) {
    return null;
  }
  const label = state.isOpen ? t`Hide insights` : t`Show insights`;
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="default"
        size="lg"
        className={S.toggle}
        aria-label={label}
        aria-pressed={state.isOpen}
        onClick={state.onToggle}
        onMouseEnter={() => state.onHint(true)}
        onMouseLeave={() => state.onHint(false)}
      >
        <Icon name="insight" />
      </ActionIcon>
    </Tooltip>
  );
};
