import { Link } from "metabase/common/components/Link";
import type { ChecklistItemValue } from "metabase/redux/store";
import { Button, Group } from "metabase/ui";

import { trackChecklistItemCTAClicked } from "./analytics";
import type { ChecklistItemCTA } from "./types";

export interface ChecklistAction {
  label: string;
  to: string;
  /** Drives both the button styling and the analytics `event_detail`. */
  cta: ChecklistItemCTA;
}

interface ChecklistItemActionsProps {
  value: ChecklistItemValue;
  actions: ChecklistAction[];
}

export const ChecklistItemActions = ({
  value,
  actions,
}: ChecklistItemActionsProps) => (
  <Group gap={0} data-testid={`${value}-cta`}>
    {actions.map(({ cta, label, to }) => (
      <Link
        key={to}
        to={to}
        onClick={() => trackChecklistItemCTAClicked(value, cta)}
      >
        <Button variant={cta === "primary" ? "outline" : "subtle"}>
          {label}
        </Button>
      </Link>
    ))}
  </Group>
);
