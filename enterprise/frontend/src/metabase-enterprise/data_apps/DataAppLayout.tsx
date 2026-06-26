import { useClickOutside } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { Box, Button, Group, Icon, Paper, Select } from "metabase/ui";
import { useListDataAppsQuery } from "metabase-enterprise/api";

import S from "./DataAppLayout.module.css";

const DATA_APPS_SETTINGS_PATH = "/admin/settings/data-apps";

interface DataAppLayoutProps {
  params: { name: string };
  children: ReactNode;
}

/**
 * Full-page chrome for a data app. The app itself (an iframe) fills the whole
 * viewport; a slim panel peeks from the top edge and slides down on hover,
 * giving a way back to the admin list and a selector to switch between apps.
 */
export function DataAppLayout({ params, children }: DataAppLayoutProps) {
  const { name } = params;
  const dispatch = useDispatch();

  const [hovered, setHovered] = useState(false);
  // While the app selector's dropdown is open we pin the panel down, so it stays
  // put even if the cursor drifts off the panel mid-interaction. The dropdown is
  // controlled so we can also force it shut — e.g. on a click-outside or when
  // focus moves into the data-app iframe.
  const [selectOpened, setSelectOpened] = useState(false);

  // The panel is up only when both are false, so it can never retract while the
  // selector is still open: when it flies back, the selector is already closed.
  const expanded = hovered || selectOpened;

  const collapse = useCallback(() => {
    setHovered(false);
    setSelectOpened(false);
  }, []);

  // Click-outside within this document: anything but the toolbar (the dropdown
  // is rendered inside it, so its options count as inside) collapses it.
  const zoneRef = useClickOutside<HTMLDivElement>(collapse);

  // A click inside the data-app iframe never reaches this document, so the
  // click-outside above can't see it. Focus moving into the iframe blurs the top
  // window — treat that as the iframe's "click outside".
  useEffect(() => {
    const handleWindowBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) {
        collapse();
      }
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [collapse]);

  const { data: apps = [] } = useListDataAppsQuery();

  const appOptions = useMemo(
    () =>
      apps
        .filter((app) => app.enabled)
        .map((app) => ({ value: app.name, label: app.display_name })),
    [apps],
  );

  const handleGoBack = () => {
    dispatch(push(DATA_APPS_SETTINGS_PATH));
  };

  const handleSelectApp = (nextName: string) => {
    if (nextName && nextName !== name) {
      dispatch(push(`/data-app/${encodeURIComponent(nextName)}`));
    }
  };

  return (
    <Box className={S.root}>
      <div
        ref={zoneRef}
        className={cx(S.zone, { [S.expanded]: expanded })}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Stable hover hotspot pinned to the top edge. It never moves between
            states, so hovering the handle always toggles the panel — the panel
            itself slides independently below. */}
        <div className={S.trigger}>
          <div className={S.handle} aria-hidden>
            <Icon name="chevrondown" size={14} />
          </div>
        </div>

        <Paper
          className={S.panel}
          shadow="md"
          radius="md"
          withBorder
          p="sm"
          bg="background-primary"
        >
          <Group gap="sm" wrap="nowrap">
            <Button
              variant="subtle"
              leftSection={<Icon name="arrow_left" />}
              onClick={handleGoBack}
            >
              {t`Go back`}
            </Button>
            <Select
              data={appOptions}
              value={name}
              onChange={handleSelectApp}
              placeholder={t`Switch data app`}
              aria-label={t`Switch data app`}
              comboboxProps={{ withinPortal: false }}
              dropdownOpened={selectOpened}
              onDropdownOpen={() => setSelectOpened(true)}
              onDropdownClose={() => setSelectOpened(false)}
              w="14rem"
            />
          </Group>
        </Paper>
      </div>

      <Box className={S.content}>{children}</Box>
    </Box>
  );
}
