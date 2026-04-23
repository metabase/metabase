import { t } from "ttag";

import type { User } from "metabase-types/api";

import { userColor } from "./userColor";

// eslint-disable-next-line metabase/no-color-literals -- matches userColor.ts palette style; gray fallback has no theme token.
const ANONYMOUS_COLOR = "#888888";

export interface AwarenessUser {
  name: string;
  color: string;
}

export function getAwarenessUser(user: User | null | undefined): AwarenessUser {
  if (!user) {
    return { name: t`User`, color: ANONYMOUS_COLOR };
  }
  return { name: user.common_name, color: userColor(user.id) };
}
