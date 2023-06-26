import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingInput from "./SettingInput";

describe("SettingInput", () => {
  it("when type=number should allow decimal values", () => {
    const onChange = jest.fn();
    render(
      <SettingInput
        onChange={onChange}
        setting={{
          key: "test",
          value: "100",
          default: "100",
          placeholder: "numeric value",
        }}
        type="number"
      />,
    );

    userEvent.type(screen.getByPlaceholderText("numeric value"), ".25");
    userEvent.tab(); // blur

    expect(onChange).toHaveBeenCalledWith(100.25);
  });
});
