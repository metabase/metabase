import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DatabaseCacheTTLField from "./DatabaseCacheTTLField";

function setup({ value = null } = {}) {
  const onChange = jest.fn();
  render(
    <DatabaseCacheTTLField field={{ name: "cache_ttl", value, onChange }} />,
  );
  return { onChange };
}

function selectMode(nextMode) {
  const currentModeLabel =
    nextMode === "custom" ? "Use instance default (TTL)" : "Custom";
  const nextModeLabel =
    nextMode === "instance-default" ? "Use instance default (TTL)" : "Custom";

  userEvent.click(screen.getByText(currentModeLabel));
  userEvent.click(screen.getByText(nextModeLabel));
}

describe("DatabaseCacheTTLField", () => {
  it("displays 'Use instance default' option when cache_ttl is null", () => {
    setup({ value: null });
    expect(screen.getByText("Use instance default (TTL)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cache TTL Field")).not.toBeInTheDocument();
  });

  it("displays 'Use instance default' option when cache_ttl is 0", () => {
    setup({ value: 0 });
    expect(screen.getByText("Use instance default (TTL)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cache TTL Field")).not.toBeInTheDocument();
  });

  it("sets 24 hours as a default TTL custom value", async () => {
    const { onChange } = setup();
    selectMode("custom");
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(24));
  });

  it("can select and fill custom cache TTL value", () => {
    const { onChange } = setup();

    selectMode("custom");
    const input = screen.getByPlaceholderText("24");
    userEvent.type(input, "{selectall}{backspace}14");
    input.blur();

    expect(onChange).toHaveBeenLastCalledWith(14);
  });

  it("displays input when cache_ttl has value", () => {
    setup({ value: 4 });
    expect(screen.getByDisplayValue("4")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(
      screen.queryByText("Use instance default (TTL)"),
    ).not.toBeInTheDocument();
  });

  it("can reset cache_ttl to instance default", async () => {
    const { onChange } = setup({ value: 48 });
    selectMode("instance-default");
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null));
  });
});
