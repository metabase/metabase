import { MultiAutocomplete } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  columnDisplayName: string;
  shouldCreate?: (query: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  selectedValues,
  shouldCreate,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  // const [searchValue, setSearchValue] = useState("");
  // const [searchQuery, setSearchQuery] = useState(searchValue);
  // const canSearch = searchQuery.length > 0;
  //
  // const {
  //   data: searchFieldValues = [],
  //   error: searchError,
  //   isFetching: isSearching,
  // } = useSearchFieldValuesQuery(
  //   {
  //     fieldId,
  //     searchFieldId,
  //     value: searchQuery,
  //     limit: SEARCH_LIMIT,
  //   },
  //   {
  //     skip: !canSearch,
  //   },
  // );
  //
  // const searchOptions = canSearch
  //   ? getFieldOptions(searchFieldValues)
  //   : getFieldOptions(initialFieldValues);
  // const visibleOptions = getFilteredOptions(
  //   searchOptions,
  //   searchValue,
  //   selectedValues,
  // );
  // const notFoundMessage = getNothingFoundMessage(
  //   columnDisplayName,
  //   searchError,
  //   canSearch,
  //   isSearching,
  // );
  //
  // const handleSearchChange = (newSearchValue: string) => {
  //   setSearchValue(newSearchValue);
  //   if (newSearchValue === "") {
  //     setSearchQuery(newSearchValue);
  //   }
  // };
  //
  // const handleSearchTimeout = () => {
  //   if (shouldSearch(searchValue, searchQuery, searchFieldValues)) {
  //     setSearchQuery(searchValue);
  //   }
  // };
  //
  // useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiAutocomplete
      values={selectedValues}
      options={[]}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      onChange={onChange}
    />
  );
}
