import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import { createMockParameterSourceOptions } from "metabase-types/api/mocks";
import { createMockUiParameter } from "metabase-lib/mocks";
import ParameterListSourceModal, {
  ParameterListSourceModalProps,
} from "./ParameterListSourceModal";

describe("ParameterListSourceModal", () => {
  it("should trim and set source values", () => {
    const props = getProps();

    render(<ParameterListSourceModal {...props} />);

    const input = screen.getByRole("textbox");
    userEvent.type(input, `Gadget ${specialChars.enter}`);
    userEvent.type(input, `Widget ${specialChars.enter}`);
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceOptions).toHaveBeenCalledWith({
      values: ["Gadget", "Widget"],
    });
  });

  it("should clear source values", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        source_options: createMockParameterSourceOptions({
          values: ["Gadget", "Gizmo"],
        }),
      }),
    });

    render(<ParameterListSourceModal {...props} />);
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceOptions).toHaveBeenCalledWith({ values: [] });
  });
});

const getProps = (
  opts?: Partial<ParameterListSourceModalProps>,
): ParameterListSourceModalProps => ({
  parameter: createMockUiParameter(),
  onChangeSourceOptions: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
