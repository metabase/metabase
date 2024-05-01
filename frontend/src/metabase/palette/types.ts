import type { Action, ActionImpl } from "kbar";

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
  };

export type PaletteActionImpl = ActionImpl &
  PaletteActionExtras & {
    subtitle?: Action["subtitle"];
  };
