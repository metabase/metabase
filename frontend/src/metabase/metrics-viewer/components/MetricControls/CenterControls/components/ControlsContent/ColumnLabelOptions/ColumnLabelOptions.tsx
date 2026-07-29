import cx from "classnames";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { ActionIcon, Icon, Popover, Switch } from "metabase/ui";

import S from "./ColumnLabelOptions.module.css";

type ColumnLabelOptionsProps = {
  variant?: "floating" | "inline";
};

export function ColumnLabelOptions(props: ColumnLabelOptionsProps) {
  const { variant = "floating" } = props;
  const { showColumnLabels, setShowColumnLabels } = useMetricsViewerContext();

  return (
    <Popover
      floatingStrategy="fixed"
      shadow="md"
      /* Should not be in a portal to avoid click-outside issues on parent popover */
      withinPortal={false}
    >
      <Popover.Target>
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
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Switch
          label={t`Show column labels`}
          size="sm"
          labelPosition="right"
          checked={showColumnLabels}
          onChange={(event) => setShowColumnLabels(event.currentTarget.checked)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
