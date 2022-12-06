import {
  createMockDashboardActionButton,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import type {
  ActionDashboardCard,
  ActionParametersMapping,
} from "metabase-types/api";
import { isMappedExplicitActionButton } from "./utils";

const PLAIN_BUTTON = createMockDashboardActionButton({
  action: undefined,
  visualization_settings: { click_behavior: undefined },
});

const QUERY_ACTION = createMockQueryAction();

const EXPLICIT_ACTION = createMockDashboardActionButton({
  action: QUERY_ACTION,
  visualization_settings: {
    click_behavior: undefined,
  },
});

const PARAMETER_MAPPINGS: ActionParametersMapping[] = [
  {
    parameter_id: "param",
    target: ["variable", ["template-tag", "foo"]],
  },
];

const IMPLICIT_INSERT_ACTION = createMockDashboardActionButton({
  action: createMockImplicitQueryAction({ kind: "row/create" }),
});

const IMPLICIT_UPDATE_ACTION = createMockDashboardActionButton({
  action: createMockImplicitQueryAction({ kind: "row/update" }),
});

const IMPLICIT_DELETE_ACTION = createMockDashboardActionButton({
  action: createMockImplicitQueryAction({ kind: "row/delete" }),
});

const NAVIGATION_ACTION_BUTTON = createMockDashboardActionButton({
  action: undefined,
  visualization_settings: {
    click_behavior: {
      type: "link",
      linkType: "dashboard",
      targetId: 1,
    },
  },
});

describe("isMappedExplicitActionButton", () => {
  it("returns false for navigation buttons", () => {
    expect(isMappedExplicitActionButton(NAVIGATION_ACTION_BUTTON)).toBe(false);
  });

  it("returns false for cards without action-button display", () => {
    const dashcard = createMockDashboardActionButton({
      visualization_settings: {
        virtual_card: { display: "table" },
      },
    });
    expect(isMappedExplicitActionButton(dashcard)).toBe(false);
  });

  it("returns false for plain button", () => {
    expect(isMappedExplicitActionButton(PLAIN_BUTTON)).toBe(false);
  });

  it("returns false for implicit create action button", () => {
    expect(isMappedExplicitActionButton(IMPLICIT_INSERT_ACTION)).toBe(false);
  });

  it("returns false for implicit update action button", () => {
    expect(isMappedExplicitActionButton(IMPLICIT_UPDATE_ACTION)).toBe(false);
  });

  it("returns false for implicit delete action button", () => {
    expect(isMappedExplicitActionButton(IMPLICIT_DELETE_ACTION)).toBe(false);
  });

  it("returns false for button without an explicit action attached, but with parameter mappings", () => {
    const button: ActionDashboardCard = {
      ...PLAIN_BUTTON,
      parameter_mappings: PARAMETER_MAPPINGS,
    };

    expect(isMappedExplicitActionButton(button)).toBe(false);
  });

  it("returns true for button with an explicit action attached", () => {
    expect(isMappedExplicitActionButton(EXPLICIT_ACTION)).toBe(true);
  });

  it("returns true for button with an explicit action attached and defined parameter mappings", () => {
    const button: ActionDashboardCard = {
      ...EXPLICIT_ACTION,
      parameter_mappings: PARAMETER_MAPPINGS,
    };

    expect(isMappedExplicitActionButton(button)).toBe(true);
  });
});
