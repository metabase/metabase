import React, { FormHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockCollection } from "metabase-types/api/mocks";
import NewEventModal, { NewEventModalProps } from "./NewEventModal";

const FormMock = (props: FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>
    <button>Create</button>
  </form>
);

jest.mock("metabase/containers/Form", () => FormMock);

describe("NewEventModal", () => {
  it("should submit modal", () => {
    const props = getProps();

    render(<NewEventModal {...props} />);
    userEvent.click(screen.getByText("Create"));

    expect(props.onSubmit).toHaveBeenCalled();
  });
});

const getProps = (opts?: Partial<NewEventModalProps>): NewEventModalProps => ({
  collection: createMockCollection(),
  onSubmit: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
