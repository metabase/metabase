import type { LocationDescriptor } from "history";
import type { Action, ActionImpl } from "kbar";
import type React from "react";

import type { IconName } from "metabase/ui";
import type { ModerationReviewStatus } from "metabase-types/api";

interface PaletteActionExtras {
  extra?: {
    /** isVerified: If true, will show a verified badge next to the item name */
    moderatedStatus?: ModerationReviewStatus;
    /**
     * href: If defined, the palette item will be wrapped in a link. This allows for
     * browser interactions to open items in new tabs/windows
     */
    href?: LocationDescriptor | null;
    /** iconColor: Color of the icon in the list item*/
    iconColor?: string;
    /** subtext: text to come after the item name */
    subtext?: React.ReactNode;
  };
  disabled?: boolean;
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
