import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { ActionIcon, Anchor, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

import { getTransformRunName } from "../../../../utils";
import S from "../RunSidebar.module.css";

const TOOLTIP_OPEN_DELAY_MS = 700;

type SidebarHeaderProps = {
  run: TransformRun;
  onClose: () => void;
};

export function SidebarHeader({ run, onClose }: SidebarHeaderProps) {
  const transform = run.transform;
  const label = getTransformRunName(run);

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="run-list-sidebar-header"
    >
      <Anchor
        className={cx(CS.textWrap, S.link)}
        component={ForwardRefLink}
        fz="h3"
        fw="bold"
        lh="h3"
        to={transform != null ? Urls.transform(transform.id) : ""}
      >
        {label}
      </Anchor>
      <Group gap="xs" wrap="nowrap">
        {transform != null && (
          <Tooltip
            label={t`View this transform`}
            openDelay={TOOLTIP_OPEN_DELAY_MS}
          >
            <ActionIcon
              component={ForwardRefLink}
              to={Urls.transform(transform.id)}
              target="_blank"
              aria-label={t`View this transform`}
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        {PLUGIN_DEPENDENCIES.isEnabled && transform != null && (
          <Tooltip
            label={t`View in dependency graph`}
            openDelay={TOOLTIP_OPEN_DELAY_MS}
          >
            <ActionIcon
              component={ForwardRefLink}
              to={Urls.dependencyGraph({
                entry: { id: transform.id, type: "transform" },
              })}
              target="_blank"
              aria-label={t`View in dependency graph`}
            >
              <FixedSizeIcon name="dependencies" />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
