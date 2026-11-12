import type { ContentDiagnosticsImbalancedFindingType } from "metabase-types/api";

const CONTENT_DIAGNOSTICS_URL = `/monitor/content-diagnostics`;

export function contentDiagnostics() {
  return CONTENT_DIAGNOSTICS_URL;
}

export function staleContent() {
  return `${contentDiagnostics()}/stale`;
}

export function slowContent() {
  return `${contentDiagnostics()}/slow`;
}

export function duplicatedContent() {
  return `${contentDiagnostics()}/duplicated`;
}

// The problem type is the route segment and pins the `finding-types` value.
export function imbalancedContent(
  mode: ContentDiagnosticsImbalancedFindingType,
) {
  return `${contentDiagnostics()}/${mode}`;
}
