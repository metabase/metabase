import { t } from "ttag";
import { getTranslatedEntityName } from "metabase/nav/utils";
import { Checkbox, Flex } from "metabase/ui";
import { SearchModelType } from "metabase-types/api";
import { useSearchListQuery } from "metabase/common/hooks";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { SearchFilter } from "metabase/search/components/SearchFilterModal/filters/SearchFilter";

const SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const TypeFilter = ({
  value = [],
  onChange,
  "data-testid": dataTestId,
}: {
  value?: SearchModelType[];
  onChange: (value: SearchModelType[]) => void;
  "data-testid": string;
}) => {
  const { metadata, isLoading } = useSearchListQuery({ query: SEARCH_QUERY });

  const availableModels = (metadata && metadata.available_models) ?? [];

  return isLoading ? (
    <LoadingSpinner />
  ) : (
    <SearchFilter data-testid={dataTestId} title={t`Type`}>
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
