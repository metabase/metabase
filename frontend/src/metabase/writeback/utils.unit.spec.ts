import {
  createMockDashboardActionButton,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import type {
  ActionButtonDashboardCard,
  ActionButtonParametersMapping,
} from "metabase-types/api";
import { isMappedExplicitActionButton } from "./utils";

const PLAIN_BUTTON = createMockDashboardActionButton({
  action_id: null,
  action: undefined,
  visualization_settings: { click_behavior: undefined },
});

const QUERY_ACTION = createMockQueryAction();

const EXPLICIT_ACTION = createMockDashboardActionButton({
  action_id: QUERY_ACTION.id,
  action: QUERY_ACTION,
  visualization_settings: { click_behavior: undefined },
});

const PARAMETER_MAPPINGS: ActionButtonParametersMapping[] = [
  {
    parameter_id: "param",
    target: ["variable", ["template-tag", "foo"]],
  },
];

const NAVIGATION_ACTION_BUTTON = createMockDashboardActionButton({
  action_id: null,
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

  it("returns false for button without an explicit action attached, but with parameter mappings", () => {
    const button: ActionButtonDashboardCard = {
      ...PLAIN_BUTTON,
      parameter_mappings: PARAMETER_MAPPINGS,
    };

    expect(isMappedExplicitActionButton(button)).toBe(false);
  });

  it("returns true for button with an explicit action attached", () => {
    expect(isMappedExplicitActionButton(EXPLICIT_ACTION)).toBe(true);
  });

  it("returns true for button with an explicit action attached and defined parameter mappings", () => {
    const button: ActionButtonDashboardCard = {
      ...EXPLICIT_ACTION,
      parameter_mappings: PARAMETER_MAPPINGS,
    };

    expect(isMappedExplicitActionButton(button)).toBe(true);
  });
});
