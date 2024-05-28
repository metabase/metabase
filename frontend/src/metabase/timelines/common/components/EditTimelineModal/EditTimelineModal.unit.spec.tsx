import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockTimeline } from "metabase-types/api/mocks";

import type { EditTimelineModalProps } from "./EditTimelineModal";
import EditTimelineModal from "./EditTimelineModal";

describe("EditTimelineModal", () => {
  it("should submit modal", async () => {
    const props = getProps();
    const name = "Another timeline";

    render(<EditTimelineModal {...props} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), name);
    await userEvent.click(screen.getByText("Update"));

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith({ ...props.timeline, name });
    });
  });
});

const getProps = (
  opts?: Partial<EditTimelineModalProps>,
): EditTimelineModalProps => ({
  timeline: createMockTimeline(),
  onSubmit: jest.fn(),
  onArchive: jest.fn(),
  onCancel: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
