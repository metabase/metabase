import { FilterSearchInput } from "./FilterSearchInput";

type FilterHeaderProps = {
  value: string;
  onChange: (searchText: string) => void;
};

export const FilterHeader = ({ value, onChange }: FilterHeaderProps) => {
  return <FilterSearchInput searchText={value} onChange={onChange} />;
};
