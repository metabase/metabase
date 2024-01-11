import type { CollectionPickerOptions } from './SpecificEntityPickers/CollectionPicker';
import type { EntityPickerModalOptions } from './components/EntityPickerModal';
import type { SearchListQuery } from 'metabase-types/api';
import type { EntityItemList } from './components/EntityItemList';
import type { ItemList } from './components/ItemList';

export type PickerState<T> = PickerStateItem<T>[];

export type PickerStateItem<T> = EntityPickerStateItem<T> | DataPickerStateItem<T>;

type EntityPickerStateItem<T> = {
  ListComponent: typeof EntityItemList,
  query: SearchListQuery,
  selectedItem: T | null
}

type DataPickerStateItem<T> = {
  ListComponent: typeof ItemList,
  dataFn: () => Promise<any[]>,
  selectedItem: T | null
}

export type EntityPickerOptions =
  EntityPickerModalOptions & (
    CollectionPickerOptions
  )
;
