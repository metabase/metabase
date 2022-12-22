import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import { createMockValuesSourceConfig } from "metabase-types/api/mocks";
import ListValuesSourceModal, {
  ListValuesSourceModalProps,
} from "./ListValuesSourceModal";

describe("ListValuesSourceModal", () => {
  it("should trim and set source values", () => {
    const props = getProps();

    render(<ListValuesSourceModal {...props} />);

    const input = screen.getByRole("textbox");
    userEvent.type(input, `Gadget ${specialChars.enter}`);
    userEvent.type(input, `Widget ${specialChars.enter}`);
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceConfig).toHaveBeenCalledWith({
      values: ["Gadget", "Widget"],
    });
  });

  it("should clear source values", () => {
    const props = getProps({
      sourceConfig: createMockValuesSourceConfig({
        values: ["Gadget", "Gizmo"],
      }),
    });

    render(<ListValuesSourceModal {...props} />);
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceConfig).toHaveBeenCalledWith({ values: [] });
  });
});

const getProps = (
  opts?: Partial<ListValuesSourceModalProps>,
): ListValuesSourceModalProps => ({
  sourceConfig: createMockValuesSourceConfig(),
  onChangeSourceConfig: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
