// Simple console error tracker with TypeScript typings

// Keep the original regex patterns
const VISUALIZATION_ERROR_REGEX = /Visualization/;
const DASHBOARD_GRID_ERROR_REGEX = /DashboardGrid/;
const UNSAFE_COMPONENT_ERROR_REGEX = /UNSAFE_component/;
const UNRECOGNIZED_PROP_REGEX =
  /Warning: React does not recognize the `.*?` prop on a DOM element/;
// const NON_BOOLEAN_ATTR_REGEX = /Warning: Received `.*?` for a non-boolean attribute/;
// const INVALID_DOM_PROPS_REGEX = /Warning: Invalid values for props .* on <.*?> tag/;

type TestFunction = (message: string) => boolean;
interface ErrorPattern {
  name: string;
  description: string;
  testFn: TestFunction;
}

const errorPatterns: ErrorPattern[] = [];
const errorCounts = new Map<string, number>();

export function addConsoleErrorPattern(
  name: string,
  description: string,
  testFn: TestFunction,
): void {
  errorPatterns.push({ name, description, testFn });
  errorCounts.set(name, 0);
}

export function resetConsoleErrorCounters(): void {
  errorCounts.forEach((_, key) => {
    errorCounts.set(key, 0);
  });
}

export function countConsoleErrors(args: any[]): void {
  if (!args || !args.length) {
    return;
  }

  const message = args.join(" ");

  for (const pattern of errorPatterns) {
    if (pattern.testFn(message)) {
      const currentCount = errorCounts.get(pattern.name) || 0;
      errorCounts.set(pattern.name, currentCount + 1);
    }
  }
}

export function getErrorSummary(): string {
  const summaryParts: string[] = [];

  for (const pattern of errorPatterns) {
    const count = errorCounts.get(pattern.name) || 0;
    if (count > 0) {
      summaryParts.push(`• ${pattern.description}: ${count}`);
    }
  }

  if (summaryParts.length === 0) {
    return "No console errors detected";
  }

  return "Console errors found:\n" + summaryParts.join("\n");
}

export function hasConsoleErrors(): boolean {
  return Array.from(errorCounts.values()).some((count) => count > 0);
}

addConsoleErrorPattern(
  "unrecognizedProps",
  "React does not recognize prop on DOM element",
  (message) => UNRECOGNIZED_PROP_REGEX.test(message),
);
addConsoleErrorPattern(
  "unsafeVisualization",
  "UNSAFE component in Visualization",
  (message) =>
    UNSAFE_COMPONENT_ERROR_REGEX.test(message) &&
    VISUALIZATION_ERROR_REGEX.test(message),
);
addConsoleErrorPattern(
  "unsafeDashboardGrid",
  "UNSAFE component in DashboardGrid",
  (message) =>
    UNSAFE_COMPONENT_ERROR_REGEX.test(message) &&
    DASHBOARD_GRID_ERROR_REGEX.test(message),
);
