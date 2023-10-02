/* eslint-disable react/prop-types */
import { useState } from "react";
import type { SearchFilterDropdown } from "metabase/search/types";
import { useSearchListQuery } from "metabase/common/hooks";
import { Checkbox, Stack } from "metabase/ui";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import type { EnabledSearchModelType } from "metabase-types/api";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchFilterPopoverWrapper";
import { filterEnabledSearchTypes } from "metabase/search/utils";

const EMPTY_SEARCH_QUERY = { models: "dataset", limit: 1 } as const;
export const TypeFilterContent: SearchFilterDropdown<"type">["ContentComponent"] =
  ({ value, onChange }) => {
    const { metadata, isLoading } = useSearchListQuery({
      query: EMPTY_SEARCH_QUERY,
    });

    const [selectedTypes, setSelectedTypes] = useState<
      EnabledSearchModelType[]
    >(value ?? []);

    const availableModels = (metadata && metadata.available_models) ?? [];
    const typeFilters = filterEnabledSearchTypes(availableModels);

    return (
      <SearchFilterPopoverWrapper
        isLoading={isLoading}
        onApply={() => onChange(selectedTypes)}
      >
        <Checkbox.Group
          data-testid="type-filter-checkbox-group"
          w="100%"
          value={selectedTypes}
          onChange={value =>
            setSelectedTypes(value as EnabledSearchModelType[])
          }
        >
          <Stack spacing="md" p="md" justify="center" align="flex-start">
            {typeFilters.map(model => (
              <Checkbox
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
