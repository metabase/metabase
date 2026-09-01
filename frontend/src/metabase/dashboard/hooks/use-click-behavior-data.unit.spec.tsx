import { renderHookWithProviders } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { ClickObject } from "metabase/visualizations/types";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { useClickBehaviorData } from "./use-click-behavior-data";

const TARGET_DASHBOARD = createMockDashboard({ id: 2, name: "Target" });
const TARGET_CARD = createMockCard({ id: 3, name: "Target question" });

const DASHCARD_ID = 1;

function setup({ clicked }: { clicked: ClickObject }) {
  const state = createMockState({
    dashboard: createMockDashboardState({
      dashboardId: 1,
      dashcards: {
        [DASHCARD_ID]: createMockDashboardCard({ id: DASHCARD_ID }),
      },
      linkTargets: {
        questions: { [TARGET_CARD.id]: TARGET_CARD },
        dashboards: { [TARGET_DASHBOARD.id]: TARGET_DASHBOARD },
      },
    }),
  });

  const { result } = renderHookWithProviders(
    () => useClickBehaviorData({ dashcardId: DASHCARD_ID }),
    { storeInitialState: state },
  );

  return result.current.getExtraDataForClick(clicked);
}

function clickWithLinkTo(
  linkType: "dashboard" | "question",
  targetId: number,
): ClickObject {
  // A ClickObject carries column and row data the link behaviour never reads,
  // so the settings alone are enough to exercise the target lookup.
  return {
    settings: {
      click_behavior: { type: "link", linkType, targetId },
    },
  } as ClickObject;
}

describe("useClickBehaviorData", () => {
  it("resolves a dashboard link target from dashboard state", () => {
    const extraData = setup({ clicked: clickWithLinkTo("dashboard", 2) });

    expect(extraData.dashboards).toEqual({ 2: TARGET_DASHBOARD });
  });

  it("resolves a question link target from dashboard state", () => {
    const extraData = setup({ clicked: clickWithLinkTo("question", 3) });

    expect(extraData.questions).toEqual({ 3: TARGET_CARD });
  });

  it("omits a target the dashboard did not load", () => {
    const extraData = setup({ clicked: clickWithLinkTo("dashboard", 99) });

    expect(extraData.dashboards).toBeUndefined();
  });
});
