import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  RunEntity,
  TaskRunDateFilterOption,
  TaskRunType,
} from "metabase-types/api";

import { TaskRunEntityPicker } from "./TaskRunEntityPicker";
import type { EntityValue } from "./types";

const ENTITIES: RunEntity[] = [
  { entity_type: "database", entity_id: 1, entity_name: "Sample DB" },
  { entity_type: "card", entity_id: 2, entity_name: "My question" },
];

function setup({
  runType = "sync",
  startedAt = "past7days",
  includeToday = false,
  entities = ENTITIES,
  value = null,
}: {
  runType?: TaskRunType | null;
  startedAt?: TaskRunDateFilterOption | null;
  includeToday?: boolean;
  entities?: RunEntity[];
  value?: EntityValue | null;
} = {}) {
  fetchMock.get("path:/api/task/runs/entities", entities);

  const onChange = jest.fn();
  renderWithProviders(
    <TaskRunEntityPicker
      runType={runType}
      startedAt={startedAt}
      includeToday={includeToday}
      value={value}
      onChange={onChange}
    />,
  );

  return { onChange };
}

const getEntityCalls = () =>
  fetchMock.callHistory.calls("path:/api/task/runs/entities");

describe("TaskRunEntityPicker", () => {
  it("does not request entities when the run type is missing", async () => {
    setup({ runType: null });

    await Promise.resolve();
    expect(getEntityCalls()).toHaveLength(0);
    expect(screen.getByPlaceholderText("Filter by entity")).toBeDisabled();
  });

  it("does not request entities when the start time is missing", async () => {
    setup({ startedAt: null });

    await Promise.resolve();
    expect(getEntityCalls()).toHaveLength(0);
    expect(screen.getByPlaceholderText("Filter by entity")).toBeDisabled();
  });

  it("requests entities with the resolved params once all are set", async () => {
    setup({ runType: "sync", startedAt: "past7days" });

    await waitFor(() => expect(getEntityCalls()).toHaveLength(1));

    const url = getEntityCalls()[0].url;
    expect(url).toContain("run-type=sync");
    expect(url).toContain("started-at=past7days");

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Filter by entity")).toBeEnabled(),
    );
  });

  it("appends the include-today suffix to relative ranges", async () => {
    setup({ runType: "sync", startedAt: "past7days", includeToday: true });

    await waitFor(() => expect(getEntityCalls()).toHaveLength(1));
    expect(getEntityCalls()[0].url).toContain("started-at=past7days%7E");
  });

  it("should only highlight the picked entity when the entities load after the value (GDGT-2860)", async () => {
    setup({ value: { entityType: "card", entityId: 2 } });

    const picker = screen.getByPlaceholderText("Filter by entity");
    await waitFor(() => {
      expect(picker).toHaveValue("My question");
    });
    await userEvent.click(picker);

    expect(
      await screen.findByRole("option", { name: "Sample DB" }),
    ).not.toHaveAttribute("data-combobox-selected");
    expect(screen.getByRole("option", { name: "My question" })).toHaveAttribute(
      "data-combobox-active",
    );
  });
});
