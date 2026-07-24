import type { CustomVizDisplayType } from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

const warnedMessages = new Set<string>();

function warnOnce(message: string) {
  if (!warnedMessages.has(message)) {
    warnedMessages.add(message);
    console.warn(message);
  }
}

// Test-only: the warn-once dedupe is module-level state that leaks across tests.
export function resetWarnOnceForTesting() {
  warnedMessages.clear();
}

/**
 * Runtime-validates a host-provided `allowedCustomVisualizations` value.
 * Drops (and warns about) anything that isn't a `custom:`-prefixed string.
 */
export function validateAllowedCustomVisualizations(
  value: unknown,
): CustomVizDisplayType[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    warnOnce(
      `Ignored allowedCustomVisualizations: ${JSON.stringify(value) ?? String(value)}. ` +
        'Expected an array of "custom:"-prefixed plugin identifiers, e.g. ["custom:my-viz"].',
    );
    return [];
  }

  return value.filter((entry): entry is CustomVizDisplayType => {
    if (isCustomVizDisplay(entry)) {
      return true;
    }
    warnOnce(
      `Ignored invalid allowedCustomVisualizations entry: ${JSON.stringify(entry) ?? String(entry)}. ` +
        'Entries must be "custom:"-prefixed plugin identifiers, e.g. "custom:my-viz". ' +
        "Built-in visualizations are always enabled and don't need to be listed.",
    );
    return false;
  });
}

/**
 * The `allowedCustomVisualizations` provider prop for an embed's settings.
 * Guest embeds fail closed: custom viz needs a session-authed sandbox.
 */
export function resolveAllowedCustomVisualizations(settings?: {
  isGuest?: boolean;
  allowedCustomVisualizations?: unknown;
}): CustomVizDisplayType[] {
  if (settings?.isGuest) {
    if (
      Array.isArray(settings.allowedCustomVisualizations) &&
      settings.allowedCustomVisualizations.length > 0
    ) {
      warnOnce(
        "allowedCustomVisualizations is ignored in guest embeds: custom visualizations are not supported there.",
      );
    }
    return [];
  }
  return validateAllowedCustomVisualizations(
    settings?.allowedCustomVisualizations,
  );
}
