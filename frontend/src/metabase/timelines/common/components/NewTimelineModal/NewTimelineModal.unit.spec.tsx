import React, { FormHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockCollection } from "metabase-types/api/mocks";
import NewTimelineModal, { NewTimelineModalProps } from "./NewTimelineModal";

const user = userEvent.setup();

const FormMock = (props: FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>
    <button>Create</button>
  </form>
);

jest.mock("metabase/containers/Form", () => FormMock);

describe("NewTimelineModal", () => {
  it("should submit modal", async () => {
    const props = getProps();

    render(<NewTimelineModal {...props} />);
    await user.click(screen.getByText("Create"));

    expect(props.onSubmit).toHaveBeenCalled();
  });
});

const getProps = (
  opts?: Partial<NewTimelineModalProps>,
): NewTimelineModalProps => ({
  collection: createMockCollection(),
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
