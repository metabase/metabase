import cx from "classnames";
import { t } from "ttag";

import { ActionIcon, Icon, Menu, Switch } from "metabase/ui";

import S from "./MetricControls.module.css";

type ColumnLabelOptionsProps = {
  showColumnLabels: boolean;
  onChange: (showColumnLabels: boolean) => void;
  variant?: "floating" | "inline";
};

export function ColumnLabelOptions({
  showColumnLabels,
  onChange,
  variant = "floating",
}: ColumnLabelOptionsProps) {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <ActionIcon
          className={cx(S.ellipsisMenuButton, {
            [S.ellipsisMenuButtonFloating]: variant === "floating",
            [S.ellipsisMenuButtonInline]: variant === "inline",
          })}
          aria-label={t`Column label options`}
          variant="subtle"
        >
          <Icon name="ellipsis" c="text-primary" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown p="md">
        <Switch
          label={t`Show column labels`}
          size="sm"
          labelPosition="right"
          checked={showColumnLabels}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </Menu.Dropdown>
    </Menu>
  );
}
