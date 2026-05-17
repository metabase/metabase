import userEvent from "@testing-library/user-event";

import { fireEvent, render, screen } from "__support__/ui-minimal";

import { InputWithSelectPrefix } from "./InputWithSelectPrefix";

describe("InputWithSelectPrefix", () => {
  it("renders and existing value", () => {
    render(
      <InputWithSelectPrefix
        value="http://example.com"
        prefixes={["https://", "http://"]}
        defaultPrefix="http://"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "input-prefix" })).toHaveValue(
      "http://",
    );
    expect(screen.getByDisplayValue("example.com")).toBeInTheDocument();
  });

  it("changes text value", async () => {
    const changeSpy = jest.fn();
    render(
      <InputWithSelectPrefix
        value="http://example.com"
        placeholder="my-input"
        prefixes={["https://", "http://"]}
        defaultPrefix="http://"
        onChange={changeSpy}
      />,
    );

    const input = screen.getByPlaceholderText("my-input");
    await userEvent.clear(input);
    await userEvent.type(input, "new.limo");
    fireEvent.blur(input);

    expect(changeSpy).toHaveBeenCalledWith("http://new.limo");
  });

  it("changes prefix", async () => {
    const changeSpy = jest.fn();
    render(
      <InputWithSelectPrefix
        value="http://example.com"
        prefixes={["https://", "http://"]}
        defaultPrefix="http://"
        onChange={changeSpy}
      />,
    );

    const select = screen.getByLabelText("input-prefix");
    await userEvent.click(select);
    const option = screen.getByText("https://");
    await userEvent.click(option);

    expect(changeSpy).toHaveBeenCalledWith("https://example.com");
  });
});
