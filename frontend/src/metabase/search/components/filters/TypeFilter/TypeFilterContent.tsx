import { useState } from "react";

import { useSearchQuery } from "metabase/api";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchFilterPopoverWrapper";
import { enabledSearchTypes } from "metabase/search/constants";
import type { SearchFilterDropdown } from "metabase/search/types";
import { Checkbox, Stack } from "metabase/ui";
import type { EnabledSearchModel } from "metabase-types/api";

const EMPTY_SEARCH_QUERY = {
  models: ["dataset" as const],
  limit: 1,
  calculate_available_models: true as const,
};
const ENABLED_SEARCH_TYPE_SET: ReadonlySet<string> = new Set(
  enabledSearchTypes,
);

function isEnabledSearchType(value: string): value is EnabledSearchModel {
  return ENABLED_SEARCH_TYPE_SET.has(value);
}

export const TypeFilterContent: SearchFilterDropdown<"type">["ContentComponent"] =
  ({ value, onChange, width }) => {
    const { data: response, isLoading } = useSearchQuery(EMPTY_SEARCH_QUERY);

    const [selectedTypes, setSelectedTypes] = useState<EnabledSearchModel[]>(
      value ?? [],
    );

    const availableModels = response?.available_models ?? [];
    const typeFilters = enabledSearchTypes.filter((type) =>
      availableModels.includes(type),
    );

    return (
      <SearchFilterPopoverWrapper
        isLoading={isLoading}
        onApply={() => onChange(selectedTypes)}
        w={width}
      >
        <Checkbox.Group
          data-testid="type-filter-checkbox-group"
          w="100%"
          value={selectedTypes}
          onChange={(value) =>
            setSelectedTypes(value.filter(isEnabledSearchType))
          }
        >
          <Stack gap="md" p="md" justify="center" align="flex-start">
            {typeFilters.map((model) => (
              <Checkbox
                wrapperProps={{
                  "data-testid": "type-filter-checkbox",
                }}
                key={model}
                value={model}
                label={getTranslatedEntityName(model)}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      </SearchFilterPopoverWrapper>
    );
  };
