import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import DeleteEventModal, { DeleteEventModalProps } from "./DeleteEventModal";

const user = userEvent.setup();

describe("DeleteEventModal", () => {
  it("should submit modal", async () => {
    const props = getProps();

    render(<DeleteEventModal {...props} />);
    await user.click(screen.getByText("Delete"));

    expect(props.onSubmit).toHaveBeenCalled();
  });
});

const getProps = (
  opts?: Partial<DeleteEventModalProps>,
): DeleteEventModalProps => ({
  event: createMockTimelineEvent(),
  timeline: createMockTimeline(),
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
