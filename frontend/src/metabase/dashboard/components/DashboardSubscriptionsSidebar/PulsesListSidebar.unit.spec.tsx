import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { ParameterValueOrArray } from "metabase-types/api";
import {
  createMockDashboardSubscription,
  createMockParameter,
} from "metabase-types/api/mocks";

import { buildFilterText } from "./PulsesListSidebar";

jest.mock("metabase/parameters/utils/date-formatting", () => ({
  formatDateValue: jest.fn((_parameter, value) =>
    value === "2024-01-15" ? "January 15, 2024" : null,
  ),
}));

describe("buildFilterText", () => {
  const stateParameter = createMockUiParameter({
    id: "1",
    name: "State",
    slug: "state",
    type: "string/=",
  });

  const buildPulse = (value: ParameterValueOrArray) =>
    createMockDashboardSubscription({
      parameters: [createMockParameter({ id: "1", value })],
    });

  it("returns an empty string when no parameters have values", () => {
    expect(
      buildFilterText(createMockDashboardSubscription(), [stateParameter]),
    ).toBe("");
  });

  it("renders a single value", () => {
    expect(buildFilterText(buildPulse("CA"), [stateParameter])).toBe(
      "State: CA",
    );
  });

  it("renders a single-element array value", () => {
    expect(buildFilterText(buildPulse(["CA"]), [stateParameter])).toBe(
      "State: CA",
    );
  });

  it("renders a numeric value", () => {
    expect(buildFilterText(buildPulse(42), [stateParameter])).toBe("State: 42");
  });

  it("summarizes multi-value selections", () => {
    expect(buildFilterText(buildPulse(["CA", "NY"]), [stateParameter])).toBe(
      "State: 2 selections",
    );
  });

  it("drops nullish array entries instead of rendering them", () => {
    expect(buildFilterText(buildPulse([null]), [stateParameter])).toBe(
      "State: ",
    );
  });

  it("mentions the number of additional filters", () => {
    const cityParameter = createMockUiParameter({
      id: "2",
      name: "City",
      slug: "city",
      type: "string/=",
    });
    const pulse = createMockDashboardSubscription({
      parameters: [
        createMockParameter({ id: "1", value: "CA" }),
        createMockParameter({ id: "2", value: "SF" }),
      ],
    });
    expect(buildFilterText(pulse, [stateParameter, cityParameter])).toBe(
      "State: CA and 1 more filter",
    );
  });

  it("formats date parameter values", () => {
    const dateParameter = createMockUiParameter({
      id: "3",
      name: "Created At",
      slug: "created_at",
      type: "date/single",
    });
    const pulse = createMockDashboardSubscription({
      parameters: [createMockParameter({ id: "3", value: "2024-01-15" })],
    });
    expect(buildFilterText(pulse, [dateParameter])).toBe(
      "Created At: January 15, 2024",
    );
  });
});
