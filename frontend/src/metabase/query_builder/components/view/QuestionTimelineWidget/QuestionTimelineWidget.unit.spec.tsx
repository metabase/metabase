import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders } from "__support__/ui";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";

import { QuestionTimelineWidget } from "./QuestionTimelineWidget";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const setup = ({ isShowingTimelineSidebar = false } = {}) =>
  renderWithProviders(<QuestionTimelineWidget />, {
    storeInitialState: createMockState({
      qb: createMockQueryBuilderState({
        uiControls: createMockQueryBuilderUIControlsState({
          isShowingTimelineSidebar,
        }),
      }),
    }),
  });

describe("QuestionTimelineWidget", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("tracks opening the events panel", async () => {
    setup();

    await userEvent.click(getIcon("calendar"));

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "question_events_panel_opened",
      triggered_from: "footer",
    });
  });

  it("does not track closing the events panel", async () => {
    setup({ isShowingTimelineSidebar: true });

    await userEvent.click(getIcon("calendar"));

    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });
});
