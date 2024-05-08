import type { LocationDescriptor } from "history";
import type { Action, ActionImpl } from "kbar";

import type { IconName } from "metabase/ui";

interface PaletteActionExtras {
  extra?: {
    /** parentCollection: Name of the collection to show in the palette item */
    parentCollection?: string | null;
    /** isVerified: If true, will show a verified badge next to the item name */
    isVerified?: boolean;
    /** database: Name of the database to show next the name in the palette item. */
    database?: string | null;
    /**
     * href: If defined, the palette item will be wrapped in a link. This allows for
     * browser interactions to open items in new tabs/windows
     */
    href?: LocationDescriptor | null;
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
