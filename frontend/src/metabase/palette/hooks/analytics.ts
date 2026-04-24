import { trackSimpleEvent } from "metabase/analytics";

import type { KeyboardShortcutId } from "../shortcuts";

export const trackKeyboardShortcutPerformed = (id: KeyboardShortcutId) =>
  trackSimpleEvent({
    event: "keyboard_shortcut_performed",
    event_detail: id,
  });
