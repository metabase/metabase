import { match } from "ts-pattern";
import { t } from "ttag";

import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import type { CurrentApp } from "metabase/nav/components/AppSwitcher/useGetCurrentApp";
import { Group, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./SpaceSwitcherHeading.module.css";
import { useRegisterSpaceSwitcherHeading } from "./space-switcher-heading-store";

/** The name a space's heading shows, for spaces whose layout has no title. */
export function getSpaceHeading(space: CurrentApp): string {
  return (
    match(space)
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- fallback; the main nav passes the application name
      .with("main", () => t`Metabase`)
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- matches the admin bar's existing title
      .with("admin", () => t`Metabase Admin`)
      .with("data-studio", () => t`Data studio`)
      .with("monitor", () => t`Monitor`)
      .with("embedding-hub", () => t`Embedding hub`)
      .exhaustive()
  );
}

/**
 * PROTOTYPE: the "No top nav" variant's space name beside a space's logo, a
 * 14px bold heading with a chevron that opens the space switcher menu.
 */
export function SpaceSwitcherHeading({
  label,
  isOnDarkBackground = false,
}: {
  label: string;
  /** Uses inverse colors, e.g. on the admin bar. */
  isOnDarkBackground?: boolean;
}) {
  useRegisterSpaceSwitcherHeading();

  return (
    <AppSwitcher
      menuPosition="bottom-start"
      showProfile={false}
      target={
        <UnstyledButton
          className={S.heading}
          aria-label={t`Switch space`}
          data-on-dark={isOnDarkBackground || undefined}
        >
          <Group gap="xxs" wrap="nowrap">
            <Text fz={14} fw={700} c="inherit" truncate>
              {label}
            </Text>
            {/* Nudged down to sit on the heading's optical center. */}
            <Icon
              name="chevrondown"
              size={16}
              c={
                isOnDarkBackground ? "icon-secondary-inverse" : "icon-secondary"
              }
              style={{ flexShrink: 0, transform: "translateY(1px)" }}
            />
          </Group>
        </UnstyledButton>
      }
    />
  );
}
