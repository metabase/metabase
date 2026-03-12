import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { DeleteEventModalProps } from "./DeleteEventModal";
import DeleteEventModal from "./DeleteEventModal";

describe("DeleteEventModal", () => {
  it("should submit modal", async () => {
    const props = getProps();

    render(<DeleteEventModal {...props} />);
    await userEvent.click(screen.getByText("Delete"));

    expect(props.onSubmit).toHaveBeenCalled();
  });
});

const getProps = (
  opts?: Partial<DeleteEventModalProps>,
): DeleteEventModalProps => ({
  event: createMockTimelineEvent(),
  timeline: createMockTimeline(),
  onSubmit: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
