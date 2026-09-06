/**
 * Helpers for tests/click-behavior-reproductions.spec.ts — the one `H`/mock
 * helper this reproductions grab-bag needs that isn't in the spike yet:
 * createMockActionParameter (metabase-types/api/mocks/actions.ts).
 *
 * Everything else (createQuestionAndDashboard, addOrUpdateDashboardCard,
 * visitDashboard, filterWidget, popover, assertTableRowsCount,
 * clickBehaviorSidebar, saveDashboard, chartPathWithFillColor, …) is imported
 * read-only from the consolidated shared modules.
 */

export type MockActionParameter = {
  id: string;
  target: unknown;
} & Record<string, unknown>;

/**
 * Port of createMockActionParameter (metabase-types/api/mocks/actions.ts),
 * which layers a default `target: ["variable", ["template-tag", id]]` on top of
 * createMockParameter's defaults (`name: "ID"`, `type: "type/Integer"`,
 * `slug: "id"`). The caller's fields win over every default.
 */
export function createMockActionParameter({
  id = "id",
  target = ["variable", ["template-tag", id]],
  ...opts
}: { id?: string; target?: unknown } & Record<string, unknown> = {}): MockActionParameter {
  return {
    id,
    name: "ID",
    type: "type/Integer",
    slug: "id",
    ...opts,
    target,
  };
}
