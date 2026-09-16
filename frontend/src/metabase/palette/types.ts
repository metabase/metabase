import type { Action, ActionImpl } from "kbar";
import type React from "react";

import type { To } from "metabase/router";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName, ModerationReviewStatus } from "metabase-types/api";

interface PaletteActionExtras {
  extra?: {
    /** isVerified: If true, will show a verified badge next to the item name */
    moderatedStatus?: ModerationReviewStatus;
    /**
     * href: If defined, the palette item will be wrapped in a link. This allows for
     * browser interactions to open items in new tabs/windows
     */
    href?: To | null;
    /** iconColor: Color of the icon in the list item*/
    iconColor?: ColorName;
    /** subtext: text to come after the item name */
    subtext?: React.ReactNode;
  };
  disabled?: boolean;
}

export type PaletteAction = Action &
  PaletteActionExtras & {
    subtitle?: Action["subtitle"];
    icon?: IconName;
    iconUrl?: string;
  };

export type PaletteActionImpl = ActionImpl &
  PaletteActionExtras & {
    subtitle?: Action["subtitle"];
    icon?: IconName;
    iconUrl?: string;
  };
