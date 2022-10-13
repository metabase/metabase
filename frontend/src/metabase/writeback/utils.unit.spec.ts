import {
  createMockDashboardActionButton,
  createMockQueryAction,
  createMockImplictQueryAction,
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
    action_slug: "action_1337",
  },
});

const PARAMETER_MAPPINGS: ActionParametersMapping[] = [
  {
    parameter_id: "param",
    target: ["variable", ["template-tag", "foo"]],
  },
];

const IMPLICIT_INSERT_ACTION = createMockDashboardActionButton({
  action: createMockImplictQueryAction({ slug: "insert" }),
  visualization_settings: {
    action_slug: "insert",
  },
});

const IMPLICIT_UPDATE_ACTION = createMockDashboardActionButton({
  action: createMockImplictQueryAction({ slug: "update" }),
  visualization_settings: {
    action_slug: "update",
  },
});

const IMPLICIT_DELETE_ACTION = createMockDashboardActionButton({
  action: createMockImplictQueryAction({ slug: "delete" }),
  visualization_settings: {
    action_slug: "delete",
  },
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
