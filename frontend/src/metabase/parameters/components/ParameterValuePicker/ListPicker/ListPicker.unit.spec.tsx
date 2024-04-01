import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListPicker } from "./ListPicker";

const VALUES = [
  "1 A Point Pleasant Road",
  "1 Appaloosa Court",
  "1 Benson Creek Drive",
  "1 Fox Lane",
  "1 Joseph Drive",
  "1 Old Garrard Road",
  "1 Rabbit Island",
  "1 Spring Brook Lane",
  "1 Uinaq Road",
  "1 Whitams Island",
  "1-1245 Lee Road 146",
  "1-5 Texas 41",
  "1-661 Poverty Lane",
  "1-7 County Road 462",
  "1-799 Smith Road",
];

const userEvent2 = userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup(value: string, values: string[], searchDebounceMs?: number) {
  const onChangeMock = jest.fn();
  const onClearMock = jest.fn();
  const onSearchChange = jest.fn();

  const { rerender, unmount } = render(
    <ListPicker
      value={value}
      options={values}
      onChange={onChangeMock}
      onClear={onClearMock}
      onSearchChange={onSearchChange}
      searchDebounceMs={searchDebounceMs}
      enableSearch
      isLoading={false}
      noResultsText="Nothing"
      placeholder="Pick values"
    />,
  );

  return {
    rerender,
    unmount,
    onChangeMock,
    onClearMock,
    onSearchChange,
  };
}

describe("ListPicker", () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it("onSearchChange fires only once per input char", async () => {
    const { onSearchChange } = setup("", VALUES.slice());

    const select = screen.getByPlaceholderText("Pick values");
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("");

    await userEvent.click(select);
    await userEvent.type(select, "A");
    expect(onSearchChange).toHaveBeenCalledTimes(2);
    expect(onSearchChange).toHaveBeenCalledWith("A");

    await userEvent.type(select, "B");
    expect(onSearchChange).toHaveBeenCalledTimes(3);
    expect(onSearchChange).toHaveBeenCalledWith("AB");
  });

  it("onSearchChange debounced works", async () => {
    jest.useFakeTimers({ advanceTimers: false });
    const { onSearchChange } = setup("", VALUES.slice(), 100);
    const select = screen.getByPlaceholderText("Pick values");

    await userEvent2.click(select);
    await userEvent2.type(select, "H");
    await userEvent2.type(select, "e");
    await userEvent2.type(select, "l");
    await userEvent2.type(select, "l");
    await userEvent2.type(select, "o");

    expect(onSearchChange).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(101);
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("Hello");
  });

  it("onSearchChange is called on unmount", async () => {
    const { onSearchChange, unmount } = setup("", VALUES.slice(), 100);
    const select = screen.getByPlaceholderText("Pick values");

    await userEvent.click(select);
    await userEvent.type(select, "B");
    await userEvent.type(select, "y");
    await userEvent.type(select, "e");
    unmount();

    // Careful, this won't catch calling it after the component was unmounted
    await waitFor(() => expect(onSearchChange).toHaveBeenCalledTimes(1));
    expect(onSearchChange).toHaveBeenCalledWith("Bye");
  });
});
