import type { Action, ActionImpl } from "kbar";

import type { IconName } from "metabase/ui";

interface PaletteActionExtras {
  extra?: {
    parentCollection?: string | null;
    isVerified?: boolean;
    database?: string | null;
  };
}

export type PaletteAction = Action &
  PaletteActionExtras & {
    subtitle?: Action["subtitle"];
    icon?: IconName;
  };

export type PaletteActionImpl = ActionImpl &
  PaletteActionExtras & {
    subtitle?: Action["subtitle"];
    icon?: IconName;
  };
