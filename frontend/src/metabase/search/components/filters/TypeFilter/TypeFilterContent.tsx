/* eslint-disable react/prop-types */
import { useState } from "react";

import { useSearchListQuery } from "metabase/common/hooks";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchFilterPopoverWrapper";
import { enabledSearchTypes } from "metabase/search/constants";
import type { SearchFilterDropdown } from "metabase/search/types";
import { Checkbox, Stack } from "metabase/ui";
import type { EnabledSearchModel } from "metabase-types/api";

const EMPTY_SEARCH_QUERY = { models: ["dataset" as const], limit: 1 };
export const TypeFilterContent: SearchFilterDropdown<"type">["ContentComponent"] =
  ({ value, onChange, width }) => {
    const { metadata, isLoading } = useSearchListQuery({
      query: EMPTY_SEARCH_QUERY,
    });

    const [selectedTypes, setSelectedTypes] = useState<EnabledSearchModel[]>(
      value ?? [],
    );

    const availableModels = (metadata && metadata.available_models) ?? [];
    const typeFilters = enabledSearchTypes.filter(type =>
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
          onChange={value => setSelectedTypes(value as EnabledSearchModel[])}
        >
          <Stack spacing="md" p="md" justify="center" align="flex-start">
            {typeFilters.map(model => (
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
