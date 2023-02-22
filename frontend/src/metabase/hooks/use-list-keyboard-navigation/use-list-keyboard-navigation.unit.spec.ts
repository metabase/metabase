/* eslint-disable jest/expect-expect */
import { fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";

import { useListKeyboardNavigation } from "./use-list-keyboard-navigation";

const list = [
  { id: 1, name: "first" },
  { id: 2, name: "second" },
  { id: 3, name: "third" },
];

const assertItemWithIndexSelected = (
  index: number,
  result: ReturnType<typeof useListKeyboardNavigation>,
) => {
  const { selectedItem, getRef, cursorIndex } = result;
  expect(selectedItem).toBe(list[index]);
  expect(cursorIndex).toBe(index);

  list.forEach((item, i) => {
    if (index === i) {
      expect(getRef(item)).not.toBeUndefined();
    } else {
      expect(getRef(item)).toBeUndefined();
    }
  });
};

const fireKey = (key: string) => fireEvent.keyDown(window, { key });

describe("useListKeyboardNavigation", () => {
  it("no selected item initially", () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation<unknown>({ list, onEnter: jest.fn() }),
    );
    const { selectedItem, getRef } = result.current;

    expect(selectedItem).toBeNull();
    expect(list.some(getRef)).toBeFalsy();
  });

  it("navigates list downwards", () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation<unknown>({ list, onEnter: jest.fn() }),
    );

    fireKey("ArrowDown");
    assertItemWithIndexSelected(0, result.current);

    fireKey("ArrowDown");
    assertItemWithIndexSelected(1, result.current);

    fireKey("ArrowDown");
    assertItemWithIndexSelected(2, result.current);

    fireKey("ArrowDown");
    assertItemWithIndexSelected(0, result.current);
  });

  it("navigates list upwards", () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation<unknown>({ list, onEnter: jest.fn() }),
    );

    fireKey("ArrowUp");
    assertItemWithIndexSelected(2, result.current);

    fireKey("ArrowUp");
    assertItemWithIndexSelected(1, result.current);

    fireKey("ArrowUp");
    assertItemWithIndexSelected(0, result.current);

    fireKey("ArrowUp");
    assertItemWithIndexSelected(2, result.current);
  });

  it("navigates mixed upwards and downwards", () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation<unknown>({ list, onEnter: jest.fn() }),
    );

    fireKey("ArrowUp");
    assertItemWithIndexSelected(2, result.current);

    fireKey("ArrowDown");
    assertItemWithIndexSelected(0, result.current);
  });

  it("calls onEnter when Enter pressed", () => {
    const onEnterMock = jest.fn();
    const { unmount } = renderHook(() =>
      useListKeyboardNavigation({ list, onEnter: onEnterMock }),
    );

    fireKey("Enter");
    expect(onEnterMock).not.toHaveBeenCalled();

    fireKey("ArrowDown");
    fireKey("Enter");
    expect(onEnterMock).toHaveBeenCalledWith(list[0]);
    onEnterMock.mockClear();

    unmount();

    fireKey("Enter");
    expect(onEnterMock).not.toHaveBeenCalled();
  });
});
