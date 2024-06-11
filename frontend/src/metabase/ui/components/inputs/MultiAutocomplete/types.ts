export type Base = string | number | boolean | null;

export type SelectItem<TValue extends Base> = {
  label?: string;
  value: TValue;
};

export type FilterFn<TValue extends Base> = (
  query: string,
  selected: boolean,
  item: SelectItem<TValue>,
) => boolean;
