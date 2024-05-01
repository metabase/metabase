import type { Action } from "kbar";

export interface PaletteAction extends Action {
  extra?: {
    parentCollection?: string | null;
    isVerified?: boolean;
    database?: string | null;
  };
}
