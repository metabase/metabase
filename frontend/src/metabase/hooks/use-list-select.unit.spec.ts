import { renderHook, act } from "@testing-library/react-hooks";

import { useListSelect } from "./use-list-select";

interface objectType {
  id: number;
  name: string;
}

const OBJECT_LIST = [
  { id: 1, name: "first" },
  { id: 2, name: "second" },
  { id: 3, name: "third" },
];

const OBJECT_KEY_FN = (item: objectType) => `${item.id}:${item.name}`;

const setup = () => {
  const { result } = renderHook(() => useListSelect<objectType>(OBJECT_KEY_FN));

  return result;
};

describe("useListSelect", () => {
  it("should have no selected items initially", () => {
    const result = setup();

    expect(result.current.selected).toHaveLength(0);
  });

  it("should select a disabled item when toggling it", () => {
    const result = setup();

    const itemToToggle = OBJECT_LIST[0];
    act(() => result.current.toggleItem(itemToToggle));

    expect(result.current.getIsSelected(OBJECT_LIST[0])).toBeTruthy();

    expect(result.current.selected).toHaveLength(1);
    expect(result.current.selected.includes(itemToToggle)).toBeTruthy();
  });

  it("should un-select an enabled item when toggling it", () => {
    const result = setup();

    // select items first
    const itemsToSelect = [OBJECT_LIST[0], OBJECT_LIST[2]];
    act(() => result.current.selectOnlyTheseItems(itemsToSelect));
    expect(result.current.getIsSelected(OBJECT_LIST[0])).toBeTruthy();

    expect(result.current.selected.includes(OBJECT_LIST[0])).toBeTruthy();
    expect(result.current.selected).toHaveLength(itemsToSelect.length);

    // toggle it to un-select it
    act(() => result.current.toggleItem(OBJECT_LIST[0]));
    expect(result.current.getIsSelected(OBJECT_LIST[0])).toBeFalsy();

    expect(result.current.selected.includes(OBJECT_LIST[0])).toBeFalsy();
    expect(result.current.selected).toHaveLength(1);
  });

  it("should select only the items passed when using selectOnlyTheseItems() (clear all items not passed)", () => {
    const result = setup();

    // select one item
    const firstSelection = OBJECT_LIST[0];
    act(() => result.current.toggleItem(firstSelection));
    expect(result.current.getIsSelected(firstSelection)).toBeTruthy();

    // select all items except item one
    const itemsToSelect = [OBJECT_LIST[1], OBJECT_LIST[2]];
    act(() => result.current.selectOnlyTheseItems(itemsToSelect));

    expect(result.current.getIsSelected(firstSelection)).toBeFalsy();
    itemsToSelect.forEach(item => {
      expect(result.current.getIsSelected(item)).toBeTruthy();
    });
  });

  it("should clear all items when calling clear()", () => {
    const result = setup();

    // select all items
    act(() => result.current.selectOnlyTheseItems(OBJECT_LIST));
    expect(result.current.selected).toHaveLength(OBJECT_LIST.length);

    // clear items
    act(() => result.current.clear());
    expect(result.current.selected).toHaveLength(0);
  });
});
