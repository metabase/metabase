import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import EditEventModal, { EditEventModalProps } from "./EditEventModal";

describe("EditEventModal", () => {
  it("should submit modal", async () => {
    const props = getProps();

    render(<EditEventModal {...props} />);
    userEvent.clear(screen.getByLabelText("Event name"));
    userEvent.type(screen.getByLabelText("Event name"), "New name");
    await waitFor(() => expect(screen.getByText("Update")).toBeEnabled());

    userEvent.click(screen.getByText("Update"));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalled());
  });
});

const getProps = (
  opts?: Partial<EditEventModalProps>,
): EditEventModalProps => ({
  event: createMockTimelineEvent(),
  timeline: createMockTimeline(),
  onSubmit: jest.fn(),
  onArchive: jest.fn(),
  onCancel: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
