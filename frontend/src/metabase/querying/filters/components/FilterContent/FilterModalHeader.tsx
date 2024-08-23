import { FilterSearchInput } from "./FilterSearchInput";

type FilterModalHeaderProps = {
  value: string;
  onChange: (searchText: string) => void;
};

export const FilterModalHeader = ({
  value,
  onChange,
}: FilterModalHeaderProps) => {
  return <FilterSearchInput searchText={value} onChange={onChange} />;
};
