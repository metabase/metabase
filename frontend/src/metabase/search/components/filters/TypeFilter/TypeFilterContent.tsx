/* eslint-disable react/prop-types */
import { useState } from "react";
import { enabledSearchTypes } from "metabase/search/constants";
import type { SearchFilterDropdown } from "metabase/search/types";
import { useSearchListQuery } from "metabase/common/hooks";
import { Checkbox, Stack } from "metabase/ui";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import type { EnabledSearchModelType } from "metabase-types/api";
import { SearchFilterPopoverWrapper } from "metabase/search/components/SearchFilterPopoverWrapper";

const EMPTY_SEARCH_QUERY = { models: "dataset", limit: 1 } as const;
export const TypeFilterContent: SearchFilterDropdown<"type">["ContentComponent"] =
  ({ value, onChange, width }) => {
    const { metadata, isLoading } = useSearchListQuery({
      query: EMPTY_SEARCH_QUERY,
    });

    const [selectedTypes, setSelectedTypes] = useState<
      EnabledSearchModelType[]
    >(value ?? []);

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
          onChange={value =>
            setSelectedTypes(value as EnabledSearchModelType[])
          }
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
