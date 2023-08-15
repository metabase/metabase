/* eslint-disable react/prop-types */
import { t } from "ttag";
import { getTranslatedEntityName } from "metabase/nav/utils";
import { Checkbox } from "metabase/ui";
import { useSearchListQuery } from "metabase/common/hooks";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { SearchFilterView } from "metabase/search/components/SearchFilterModal/filters/SearchFilterView";

import type { SearchFilterComponent } from "metabase/search/types";
import { TypeCheckboxGroupWrapper } from "metabase/search/components/SearchFilterModal/filters/TypeFilter.styled";
import { enabledSearchTypes } from "metabase/search/constants";

const EMPTY_SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const TypeFilter: SearchFilterComponent<"type"> = ({
  value = [],
  onChange,
  "data-testid": dataTestId,
}) => {
  const { metadata, isLoading } = useSearchListQuery({
    query: EMPTY_SEARCH_QUERY,
  });

  const availableModels = (metadata && metadata.available_models) ?? [];
  const typeFilters = availableModels.filter(model =>
    enabledSearchTypes.includes(model),
  );

  return isLoading ? (
    <LoadingSpinner />
  ) : (
    <SearchFilterView
      data-testid={dataTestId}
      title={t`Type`}
      align="flex-start"
    >
      <Checkbox.Group
        value={value}
        onChange={onChange}
        data-testid="type-filter-checkbox-group"
        size="md"
        inputContainer={children => (
          <TypeCheckboxGroupWrapper>{children}</TypeCheckboxGroupWrapper>
        )}
      >
        {typeFilters.map(model => (
          <Checkbox
            key={model}
            value={model}
            label={getTranslatedEntityName(model)}
          />
        ))}
      </Checkbox.Group>
    </SearchFilterView>
  );
};
