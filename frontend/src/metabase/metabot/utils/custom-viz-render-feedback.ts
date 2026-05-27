import type { VisualizationRenderErrorContext } from "metabase/visualizations/types";
import type { CustomVizPluginRuntime } from "metabase-types/api";

const MAX_STACK_LENGTH = 3000;
const MAX_PATH_LENGTH = 2000;

export type CustomVizRenderErrorDetails = {
  agentId: string;
  display: string;
  questionName: string;
  path: string;
  plugin?: CustomVizPluginRuntime;
  error: unknown;
  context?: VisualizationRenderErrorContext;
};

type NormalizedError = {
  name: string;
  message: string;
  stack?: string;
};

export function getCustomVizRenderFeedbackKey({
  agentId,
  display,
  path,
  plugin,
  error,
  context,
}: CustomVizRenderErrorDetails): string {
  const normalized = normalizeCustomVizRenderError(error);
  return [
    agentId,
    display,
    plugin?.id ?? "",
    plugin?.bundle_hash ?? "",
    context?.phase ?? "",
    normalized.name,
    normalized.message,
    path,
  ].join("|");
}

export function getCustomVizRenderFeedbackAttemptKey({
  agentId,
  display,
}: Pick<CustomVizRenderErrorDetails, "agentId" | "display">): string {
  return `${agentId}:${display}`;
}

export function getCustomVizRenderFeedbackPrompt(
  details: CustomVizRenderErrorDetails,
): string {
  const { display, questionName, path, plugin, context } = details;
  const error = normalizeCustomVizRenderError(details.error);
  const lines = [
    "Custom visualization render feedback: failed.",
    "",
    "The generated custom visualization failed to render in the frontend. Please fix it by calling create_custom_visualization again for the same query and user intent when possible. Do not ask the user to debug it.",
    "",
    "Render result:",
    "- status: failed",
    `- phase: ${context?.phase ?? "unknown"}`,
    `- question: ${questionName}`,
    `- display: ${display}`,
  ];

  if (plugin) {
    lines.push(
      `- plugin id: ${plugin.id}`,
      `- plugin identifier: ${plugin.identifier}`,
      `- plugin name: ${plugin.display_name}`,
      `- bundle hash: ${plugin.bundle_hash ?? "none"}`,
    );
  }

  lines.push(
    `- question path: ${truncate(path, MAX_PATH_LENGTH)}`,
    `- error name: ${error.name}`,
    `- error message: ${error.message}`,
  );

  if (error.stack) {
    lines.push(
      "",
      "Stack:",
      "```",
      truncate(error.stack, MAX_STACK_LENGTH),
      "```",
    );
  }

  lines.push(
    "",
    "Custom-viz sandbox notes:",
    "- Avoid blocked DOM operations and tags, including input, form, a, script, iframe, object, embed, link, meta, base, frame, map, area, style, video, audio, source, track, use, image, feImage, and foreignObject.",
    "- Use plain button, div, span, and SVG elements for controls and drawing. Avoid innerHTML that would create forbidden tags.",
  );

  return lines.join("\n");
}

export function normalizeCustomVizRenderError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
    };
  }

  return {
    name: "Error",
    message: stringifyUnknownError(error),
  };
}

function stringifyUnknownError(error: unknown): string {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n[truncated]`;
}
