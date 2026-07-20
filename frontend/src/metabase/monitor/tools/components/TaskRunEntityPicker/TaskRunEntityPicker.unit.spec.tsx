import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  RunEntity,
  TaskRunDateFilterOption,
  TaskRunType,
} from "metabase-types/api";

import { TaskRunEntityPicker } from "./TaskRunEntityPicker";

const ENTITIES: RunEntity[] = [
  { entity_type: "database", entity_id: 1, entity_name: "Sample DB" },
  { entity_type: "card", entity_id: 2, entity_name: "My question" },
];

function setup({
  runType = "sync",
  startedAt = "past7days",
  includeToday = false,
  entities = ENTITIES,
}: {
  runType?: TaskRunType | null;
  startedAt?: TaskRunDateFilterOption | null;
  includeToday?: boolean;
  entities?: RunEntity[];
} = {}) {
  fetchMock.get("path:/api/task/runs/entities", entities);

  const onChange = jest.fn();
  renderWithProviders(
    <TaskRunEntityPicker
      runType={runType}
      startedAt={startedAt}
      includeToday={includeToday}
      value={null}
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

    // Give any erroneously scheduled request a chance to fire.
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
});
