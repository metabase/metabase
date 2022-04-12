import React, { FormHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import EditEventModal, { EditEventModalProps } from "./EditEventModal";

const FormMock = (props: FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>
    <button>Update</button>
  </form>
);

jest.mock("metabase/containers/Form", () => FormMock);

describe("EditEventModal", () => {
  it("should submit modal", () => {
    const props = getProps();

    render(<EditEventModal {...props} />);
    userEvent.click(screen.getByText("Update"));

    expect(props.onSubmit).toHaveBeenCalled();
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
