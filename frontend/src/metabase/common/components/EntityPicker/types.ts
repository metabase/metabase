import type { CollectionPickerOptions } from './SpecificEntityPickers/CollectionPicker';
import type { EntityPickerModalOptions } from './components/EntityPickerModal';

export type PickerState<T> = PickerStateItem<T>[];

export type PickerStateItem<T> = {
  items: T[];
  selectedItem: T | null;
};

export type EntityPickerOptions =
  EntityPickerModalOptions & (
    CollectionPickerOptions
  )
;
