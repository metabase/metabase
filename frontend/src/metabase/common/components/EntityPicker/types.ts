import type { CollectionPickerOptions } from './SpecificEntityPickers/CollectionPicker';
import type { EntityPickerModalOptions } from './components/EntityPickerModal';

export type PickerState<T> = PickerStateItem<T>[];

export type PickerStateItem<T> = {
  items: (Partial<T> & { model: string })[];
  selectedItem: (Partial<T> & { model: string }) | null;
};

export type EntityPickerOptions =
  EntityPickerModalOptions & (
    CollectionPickerOptions
  )
;
