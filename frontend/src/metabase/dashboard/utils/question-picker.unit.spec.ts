import type {
  OmniPickerCollectionItem,
  OmniPickerDashboardItem,
} from "metabase/common/components/Pickers";

import { isQuestionPickerItemDisabled } from "./question-picker";

const DASHBOARD_ID = 1;
const OTHER_DASHBOARD_ID = 2;

const createDashboardItem = (
  opts: Partial<OmniPickerDashboardItem> = {},
): OmniPickerDashboardItem => ({
  model: "dashboard",
  id: DASHBOARD_ID,
  name: "Dashboard",
  ...opts,
});

const createQuestionItem = (
  opts: Partial<OmniPickerCollectionItem> = {},
): OmniPickerCollectionItem => ({
  model: "card",
  id: 10,
  name: "Question",
  ...opts,
});

describe("isQuestionPickerItemDisabled", () => {
  it("disables the current dashboard when no questions are saved in it", () => {
    expect(
      isQuestionPickerItemDisabled(createDashboardItem(), DASHBOARD_ID),
    ).toBe(true);
    expect(
      isQuestionPickerItemDisabled(
        createDashboardItem({ here: [], below: [] }),
        DASHBOARD_ID,
      ),
    ).toBe(true);
  });

  it.each(["card", "dataset", "metric"] as const)(
    "enables the current dashboard when a %s is saved in it",
    (model) => {
      expect(
        isQuestionPickerItemDisabled(
          createDashboardItem({ here: [model] }),
          DASHBOARD_ID,
        ),
      ).toBe(false);
    },
  );

  it("disables other dashboards even when questions are saved in them", () => {
    expect(
      isQuestionPickerItemDisabled(
        createDashboardItem({ id: OTHER_DASHBOARD_ID, here: ["card"] }),
        DASHBOARD_ID,
      ),
    ).toBe(true);
  });

  it("disables questions saved in another dashboard", () => {
    expect(
      isQuestionPickerItemDisabled(
        createQuestionItem({ dashboard_id: OTHER_DASHBOARD_ID }),
        DASHBOARD_ID,
      ),
    ).toBe(true);
  });

  it("enables questions saved in the current dashboard or in a collection", () => {
    expect(
      isQuestionPickerItemDisabled(
        createQuestionItem({ dashboard_id: DASHBOARD_ID }),
        DASHBOARD_ID,
      ),
    ).toBe(false);
    expect(
      isQuestionPickerItemDisabled(createQuestionItem(), DASHBOARD_ID),
    ).toBe(false);
  });
});
