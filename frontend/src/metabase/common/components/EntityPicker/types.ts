import type { CollectionItem, SearchListQuery } from 'metabase-types/api';
import type { CollectionPickerOptions } from './SpecificEntityPickers/CollectionPicker';
import type { EntityPickerModalOptions } from './components/EntityPickerModal';
import type { EntityItemList, ItemList } from './components/ItemList';

export type PickerState<T> = PickerStateItem<T>[];

export type PickerStateItem<T> = EntityPickerStateItem<T> | DataPickerStateItem<T>;

type EntityPickerStateItem<T> = {
  query?: SearchListQuery,
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

export type PickerItem = Pick<
  CollectionItem,
  'id' | 'name' | 'description' | 'can_write' | 'display' | 'model' | 'location' | 'is_personal'
>;
