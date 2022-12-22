import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockUiParameter } from "metabase-lib/mocks";
import ParameterSourceSettings, {
  ParameterSourceSettingsProps,
} from "./ParameterSourceSettings";

describe("ParameterSourceSettings", () => {
  it("should set the default source type", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        values_source_type: "static-list",
      }),
    });

    render(<ParameterSourceSettings {...props} />);
    userEvent.click(screen.getByText("Values from column"));

    expect(props.onChangeSourceType).toHaveBeenCalledWith(null);
  });

  it("should set up the static list source via the modal", () => {
    const props = getProps();

    render(<ParameterSourceSettings {...props} />);
    userEvent.click(screen.getByText("Custom list"));
    userEvent.type(screen.getByRole("textbox"), "Gadget");
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceType).toHaveBeenCalledWith("static-list");
    expect(props.onChangeSourceConfig).toHaveBeenCalledWith({
      values: ["Gadget"],
    });
  });

  it("should edit the static list source via the modal", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        values_source_type: "static-list",
        values_source_config: { values: ["Gadget"] },
      }),
    });

    render(<ParameterSourceSettings {...props} />);
    userEvent.click(screen.getByText("Edit"));
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.type(screen.getByRole("textbox"), "Widget");
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceType).toHaveBeenCalledWith("static-list");
    expect(props.onChangeSourceConfig).toHaveBeenCalledWith({
      values: ["Widget"],
    });
  });

  it("should not change the source type if the modal was dismissed", () => {
    const props = getProps();

    render(<ParameterSourceSettings {...props} />);
    userEvent.click(screen.getByText("Custom list"));
    userEvent.click(screen.getByText("Cancel"));

    expect(props.onChangeSourceType).not.toHaveBeenCalled();
    expect(props.onChangeSourceConfig).not.toHaveBeenCalled();
  });

  it("should set the default source type if the static list is empty", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        values_source_type: "static-list",
        values_source_config: { values: ["Gadget"] },
      }),
    });

    render(<ParameterSourceSettings {...props} />);
    userEvent.click(screen.getByText("Edit"));
    userEvent.clear(screen.getByRole("textbox"));
    userEvent.click(screen.getByText("Done"));

    expect(props.onChangeSourceType).toHaveBeenCalledWith(null);
    expect(props.onChangeSourceConfig).toHaveBeenCalledWith({ values: [] });
  });
});

const getProps = (
  opts?: Partial<ParameterSourceSettingsProps>,
): ParameterSourceSettingsProps => ({
  parameter: createMockUiParameter(),
  onChangeSourceType: jest.fn(),
  onChangeSourceConfig: jest.fn(),
  ...opts,
});
