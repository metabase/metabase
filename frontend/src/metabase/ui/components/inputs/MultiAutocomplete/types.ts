export type Base = string | number;

export type SelectItem<ValueType extends Base> = {
  label?: string;
  value: ValueType;
};

export type FilterFn<ValueType extends Base> = (
  query: string,
  selected: boolean,
  item: SelectItem<ValueType>,
) => boolean;
