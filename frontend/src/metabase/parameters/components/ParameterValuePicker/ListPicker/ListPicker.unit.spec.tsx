import { render, screen } from "@testing-library/react";
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
    jest.useFakeTimers({ advanceTimers: true });

    const onChangeDebounceTimeout = 100;
    const userTypingDelay = 10;

    const { onSearchChange } = setup(
      "",
      VALUES.slice(),
      onChangeDebounceTimeout,
    );
    const select = screen.getByPlaceholderText("Pick values");

    const user = userEvent.setup({
      delay: userTypingDelay,
      advanceTimers(delay) {
        jest.advanceTimersByTime(delay);
      },
    });

    await user.click(select);
    await user.type(select, "Hello");

    jest.advanceTimersByTime(onChangeDebounceTimeout);

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("Hello");

    jest.useRealTimers();
  });

  it("onSearchChange is called on unmount", async () => {
    jest.useFakeTimers({ advanceTimers: true });

    const onChangeDebounceTimeout = 100;
    const userTypingDelay = 10;

    const user = userEvent.setup({
      delay: userTypingDelay,
      advanceTimers(delay) {
        jest.advanceTimersByTime(delay);
      },
    });

    const { onSearchChange, unmount } = setup(
      "",
      VALUES.slice(),
      onChangeDebounceTimeout,
    );
    const select = screen.getByPlaceholderText("Pick values");

    await user.click(select);
    await user.type(select, "Bye");

    unmount();

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("Bye");

    jest.useRealTimers();
  });
});
