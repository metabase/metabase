import type { DevDiagnosticEntry } from "../types/diagnostics";
import type { DataAppDiagnosticEntry } from "../types/diagnostics-channel";

import { truncateDiagnosticText } from "./diagnostics-limits";

const isFailedSdkCall = (entry: DevDiagnosticEntry): boolean =>
  entry.kind === "sdk-call" &&
  (entry.error != null || (entry.status != null && entry.status >= 400));

export const isAlert = (entry: DevDiagnosticEntry): boolean =>
  entry.kind === "error" ||
  entry.kind === "blocked-api" ||
  entry.kind === "blocked-network" ||
  entry.kind === "csp-violation" ||
  isFailedSdkCall(entry);

export const formatDevDiagnostic = (entry: DevDiagnosticEntry): string => {
  switch (entry.kind) {
    case "error":
    case "blocked-api":
      return entry.message;
    case "blocked-network":
      return `Blocked ${entry.api === "xhr" ? "XMLHttpRequest" : "fetch"} to ${entry.reason}`;
    case "csp-violation":
      return `Content Security Policy (${entry.directive}) blocked ${
        entry.blockedUri || "inline content"
      }`;
    case "sdk-call": {
      // `error` is already a string — `sdk-call-capture` reads the reason out of
      // the response body (JSON `{ message }` / `{ status: "failed", error }` or
      // raw text) before recording. Here it just goes on its own line so
      // `toSummaryAndDetail` files it as the collapsible detail rather than
      // burying the endpoint behind it.
      const summary = `${entry.method} ${entry.endpoint} → ${entry.status ?? "failed"} (${entry.durationMs}ms)`;

      return entry.error ? `${summary}\n${entry.error}` : summary;
    }
    default: {
      return String(entry);
    }
  }
};

const CSP_DIRECTIVE_HINTS: Record<string, string> = {
  "connect-src":
    "Your app tried to call a URL it isn't allowed to reach. Add that URL's origin to allowed_hosts in data_app.yaml, then restart the dev server.",
  "form-action":
    "A form tried to submit to a URL the app isn't allowed to reach. Add that origin to allowed_hosts in data_app.yaml, or submit with fetch instead.",
  "frame-src":
    "Your app tried to embed another site in an iframe. Add that site's origin to allowed_hosts in data_app.yaml.",
  "script-src":
    "Your app tried to load a script from another site. Install the dependency and import it so it's bundled, instead of loading it from a CDN.",
  "style-src":
    "Your app tried to load a stylesheet from another site. Import the CSS so it's bundled instead.",
  "img-src":
    "Your app tried to load an image from a site it isn't allowed to reach. Add that origin to allowed_hosts in data_app.yaml, or bundle the image.",
  "font-src":
    "Your app tried to load a font from another site. Add that origin to allowed_hosts in data_app.yaml, or bundle the font.",
};

const CSP_FALLBACK_HINT =
  "Instance restricts what a data app may load or contact, and the dev server applies the same rules. Anything the app needs to reach must be listed under allowed_hosts in data_app.yaml.";

const getDevDiagnosticHint = (entry: DevDiagnosticEntry): string | null => {
  if (
    entry.kind === "blocked-network" &&
    entry.reason.includes("not in allowed_hosts")
  ) {
    try {
      return `Add ${new URL(entry.url).origin} to allowed_hosts in data_app.yaml (dev server restart required).`;
    } catch {
      return null;
    }
  }

  if (entry.kind === "csp-violation") {
    return CSP_DIRECTIVE_HINTS[entry.directive] ?? CSP_FALLBACK_HINT;
  }

  return null;
};

/**
 * Splits the formatted text at its first line break: readers show the summary in
 * a list and expand the detail on demand — a stack, or a failed call's response.
 */
const toSummaryAndDetail = (
  entry: DevDiagnosticEntry,
): { summary: string; detail: string | null } => {
  const text = formatDevDiagnostic(entry);
  const firstBreak = text.indexOf("\n");

  return firstBreak === -1
    ? { summary: text, detail: null }
    : {
        summary: text.slice(0, firstBreak),
        detail: text.slice(firstBreak + 1).replace(/\n+$/, ""),
      };
};

/**
 * No `eventId` — the dev server assigns it. `summary`/`detail` are re-truncated:
 * a `console.error` with many args can exceed the per-arg bound applied at
 * capture.
 */
export const toPayload = (
  entry: DevDiagnosticEntry,
): DataAppDiagnosticEntry => {
  const { summary, detail } = toSummaryAndDetail(entry);

  return {
    time: entry.time,
    kind: entry.kind,
    summary: truncateDiagnosticText(summary),
    detail: detail === null ? null : truncateDiagnosticText(detail),
    hint: getDevDiagnosticHint(entry),
    alert: isAlert(entry),
  };
};
