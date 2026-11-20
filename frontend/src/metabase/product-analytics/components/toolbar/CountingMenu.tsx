import { t } from "ttag";

import { Button, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { Grain } from "../../analyses/types";

import S from "./CountingMenu.module.css";

const getLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Count people`;
    case "session":
      return t`Count sessions`;
    case "event":
      return t`Count events`;
  }
};

const GRAIN_ICONS: Record<Grain, IconName> = {
  person: "person",
  session: "clock",
  event: "calendar",
};

type CountingMenuProps = {
  value: Grain;
};

/** What the analysis counts. It's the only option, so it can't be changed. */
export const CountingMenu = ({ value }: CountingMenuProps) => (
  <Button
    className={S.static}
    component="div"
    variant="default"
    leftSection={<Icon name={GRAIN_ICONS[value]} />}
  >
    {getLabel(value)}
  </Button>
);
