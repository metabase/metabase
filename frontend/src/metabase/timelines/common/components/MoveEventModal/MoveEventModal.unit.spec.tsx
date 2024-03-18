import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { MoveEventModalProps } from "./MoveEventModal";
import MoveEventModal from "./MoveEventModal";

describe("MoveEventModal", () => {
  it("should move an event to a different timeline", async () => {
    const event = createMockTimelineEvent({ timeline_id: 1 });
    const oldTimeline = createMockTimeline({ id: 1, name: "Builds" });
    const newTimeline = createMockTimeline({ id: 2, name: "Releases" });

    const props = getProps({
      event,
      timelines: [oldTimeline, newTimeline],
    });

    render(<MoveEventModal {...props} />);
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    await userEvent.click(screen.getByText(newTimeline.name));
    await userEvent.click(screen.getByText("Move"));
    expect(props.onSubmit).toHaveBeenLastCalledWith(
      event,
      newTimeline,
      oldTimeline,
    );
  });
});

const getProps = (
  opts?: Partial<MoveEventModalProps>,
): MoveEventModalProps => ({
  event: createMockTimelineEvent(),
  timelines: [],
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
