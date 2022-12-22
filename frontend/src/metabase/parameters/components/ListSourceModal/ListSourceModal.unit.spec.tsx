import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import { createMockValuesSourceConfig } from "metabase-types/api/mocks";
import ListSourceModal, { ListSourceModalProps } from "./ListSourceModal";

describe("ListSourceModal", () => {
  it("should trim and set source values", () => {
    const props = getProps();

    render(<ListSourceModal {...props} />);

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

    render(<ListSourceModal {...props} />);
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceConfig).toHaveBeenCalledWith({ values: [] });
  });
});

const getProps = (
  opts?: Partial<ListSourceModalProps>,
): ListSourceModalProps => ({
  sourceConfig: createMockValuesSourceConfig(),
  onChangeSourceConfig: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
