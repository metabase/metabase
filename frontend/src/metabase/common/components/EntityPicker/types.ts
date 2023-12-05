export type PickerState<T> = PickerStateItem<T>[];

export type PickerStateItem<T> = {
  items: T[];
  selectedItem: T | null;
};
