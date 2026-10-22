import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { MoveEventFormProps } from "./MoveEventForm";
import { MoveEventForm } from "./MoveEventForm";

describe("MoveEventForm", () => {
  it("should move an event to a different timeline", async () => {
    const event = createMockTimelineEvent({ timeline_id: 1 });
    const oldTimeline = createMockTimeline({ id: 1, name: "Builds" });
    const newTimeline = createMockTimeline({ id: 2, name: "Releases" });

    const props = getProps({
      event,
      timelines: [oldTimeline, newTimeline],
    });

    render(<MoveEventForm {...props} />);
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

const getProps = (opts?: Partial<MoveEventFormProps>): MoveEventFormProps => ({
  event: createMockTimelineEvent(),
  timelines: [],
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  ...opts,
});
