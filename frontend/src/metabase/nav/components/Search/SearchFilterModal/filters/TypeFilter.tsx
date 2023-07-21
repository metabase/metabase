import { getTranslatedEntityName } from "metabase/nav/utils";
import { Checkbox, Flex } from "metabase/ui";
import { SearchFilter } from "metabase/nav/components/Search/SearchFilterModal/filters/SearchFilter";
import { SearchModelType } from "metabase-types/api";
import { useSearchListQuery } from "metabase/common/hooks";
import LoadingSpinner from "metabase/components/LoadingSpinner";

const SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const TypeFilter = ({
  value,
  onChange,
}: {
  value: SearchModelType[];
  onChange: (value: SearchModelType[]) => void;
}) => {
  const { metadata, isLoading } = useSearchListQuery({ query: SEARCH_QUERY });

  const availableModels = (metadata && metadata.available_models) ?? [];

  return isLoading ? (
    <LoadingSpinner />
  ) : (
    <SearchFilter title="Type">
      <Checkbox.Group
        value={value}
        onChange={onChange}
        data-testid="type-filter-checkbox-group"
        inputContainer={children => (
          <Flex direction={{ base: "column" }} wrap={{ base: "wrap" }}>
            {children}
          </Flex>
        )}
      >
        {availableModels.map((model: SearchModelType) => (
          <Checkbox
            key={model}
            value={model}
            label={getTranslatedEntityName(model)}
          />
        ))}
      </Checkbox.Group>
    </SearchFilter>
  );
};
