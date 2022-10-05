import {
  createMockDashboardActionButton,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import type {
  ActionDashboardCard,
  ActionParametersMapping,
} from "metabase-types/api";
import { isMappedExplicitActionButton, isImplicitActionButton } from "./utils";

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

const PARAMETER_MAPPINGS: ActionParametersMapping[] = [
  {
    parameter_id: "param",
    target: ["variable", ["template-tag", "foo"]],
  },
];

const IMPLICIT_INSERT_ACTION = createMockDashboardActionButton({
  action_id: null,
  action: undefined,
  visualization_settings: {
    click_behavior: {
      type: "action",
      actionType: "insert",
      tableId: 5,
    },
  },
});

const IMPLICIT_UPDATE_ACTION = createMockDashboardActionButton({
  action_id: null,
  action: undefined,
  visualization_settings: {
    click_behavior: {
      type: "action",
      actionType: "update",
      objectDetailDashCardId: 5,
    },
  },
});

const IMPLICIT_DELETE_ACTION = createMockDashboardActionButton({
  action_id: null,
  action: undefined,
  visualization_settings: {
    click_behavior: {
      type: "action",
      actionType: "delete",
      objectDetailDashCardId: 5,
    },
  },
});

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

describe("isImplicitActionButton", () => {
  const IMPLICIT_ACTIONS = [
    { action: IMPLICIT_INSERT_ACTION, type: "insert" },
    { action: IMPLICIT_UPDATE_ACTION, type: "update" },
    { action: IMPLICIT_DELETE_ACTION, type: "delete" },
  ];

  it("returns false for navigation buttons", () => {
    expect(isImplicitActionButton(NAVIGATION_ACTION_BUTTON)).toBe(false);
  });

  it("returns false for cards without action-button display", () => {
    const dashcard = createMockDashboardActionButton({
      visualization_settings: {
        virtual_card: { display: "table" },
      },
    });
    expect(isImplicitActionButton(dashcard)).toBe(false);
  });

  it("returns false for plain button", () => {
    expect(isImplicitActionButton(PLAIN_BUTTON)).toBe(false);
  });

  it("returns false for explicit action buttons", () => {
    expect(isImplicitActionButton(EXPLICIT_ACTION)).toBe(false);
  });

  it("returns false for implicit action with incomplete shape", () => {
    const insertActionWithoutTableId = createMockDashboardActionButton({
      action_id: null,
      action: undefined,
      visualization_settings: {
        click_behavior: {
          type: "action",
          actionType: "insert",
        },
      },
    });

    expect(isImplicitActionButton(insertActionWithoutTableId)).toBe(false);
  });

  it("returns false for implicit action with unrecognized `actionType`", () => {
    const unrecognizedAction = createMockDashboardActionButton({
      action_id: null,
      action: undefined,
      visualization_settings: {
        click_behavior: {
          type: "action",
          // @ts-expect-error — testing unrecognized actionType
          actionType: "play-some-tunes",
          objectDetailDashCardId: 5,
        },
      },
    });

    expect(isImplicitActionButton(unrecognizedAction)).toBe(false);
  });

  IMPLICIT_ACTIONS.forEach(({ action, type }) => {
    it(`returns true for implicit ${type} action`, () => {
      expect(isImplicitActionButton(action)).toBe(true);
    });
  });
});
