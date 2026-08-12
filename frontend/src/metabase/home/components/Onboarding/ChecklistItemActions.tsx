import { Link } from "metabase/common/components/Link";
import type { ChecklistItemValue } from "metabase/redux/store";
import { Button, Group } from "metabase/ui";

import { trackChecklistItemCTAClicked } from "./analytics";
import type { ChecklistItemCTA } from "./types";

interface ChecklistActionBase {
  label: string;
  /** Drives both the button styling and the analytics `event_detail`. */
  cta: ChecklistItemCTA;
}

/** An action either navigates somewhere or runs a callback, never both. */
export type ChecklistAction =
  | (ChecklistActionBase & { to: string; onClick?: never })
  | (ChecklistActionBase & { onClick: () => void; to?: never });

interface ChecklistItemActionsProps {
  value: ChecklistItemValue;
  actions: ChecklistAction[];
}

export const ChecklistItemActions = ({
  value,
  actions,
}: ChecklistItemActionsProps) => (
  <Group gap={0} data-testid={`${value}-cta`}>
    {actions.map((action) => (
      <ChecklistItemAction key={action.label} value={value} action={action} />
    ))}
  </Group>
);

const ChecklistItemAction = ({
  value,
  action: { cta, label, to, onClick },
}: {
  value: ChecklistItemValue;
  action: ChecklistAction;
}) => {
  const variant = cta === "primary" ? "outline" : "subtle";
  const handleClick = () => {
    trackChecklistItemCTAClicked(value, cta);
    onClick?.();
  };

  // A navigating action renders as the anchor itself rather than wrapping one
  // around a button, which would nest two interactive elements.
  return to === undefined ? (
    <Button variant={variant} onClick={handleClick}>
      {label}
    </Button>
  ) : (
    <Button component={Link} to={to} variant={variant} onClick={handleClick}>
      {label}
    </Button>
  );
};
