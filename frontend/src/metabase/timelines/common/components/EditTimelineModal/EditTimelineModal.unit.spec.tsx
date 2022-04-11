import React, { FormHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockTimeline } from "metabase-types/api/mocks";
import EditTimelineModal, { EditTimelineModalProps } from "./EditTimelineModal";

const FormMock = (props: FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>
    <button>Update</button>
  </form>
);

jest.mock("metabase/containers/Form", () => FormMock);

describe("EditTimelineModal", () => {
  it("should submit modal", () => {
    const props = getProps();

    render(<EditTimelineModal {...props} />);
    userEvent.click(screen.getByText("Update"));

    expect(props.onSubmit).toHaveBeenCalled();
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
