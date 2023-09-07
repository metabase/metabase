/* eslint-disable react/prop-types */
import type {
  EnabledSearchModelType,
  SearchSidebarFilterComponent,
} from "metabase/search/types";
import { useSearchListQuery } from "metabase/common/hooks";
import { enabledSearchTypes } from "metabase/search/constants";
import { Checkbox, Stack } from "metabase/ui";
import { getTranslatedEntityName } from "metabase/nav/utils";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import type { SearchModelType } from "metabase-types/api";

const EMPTY_SEARCH_QUERY = { models: "dataset", limit: 1 } as const;
export const TypeFilterContent: SearchSidebarFilterComponent<"type">["ContentComponent"] =
  ({ value, onChange }) => {
    const { metadata, isLoading } = useSearchListQuery({
      query: EMPTY_SEARCH_QUERY,
    });

    const availableModels = (metadata && metadata.available_models) ?? [];
    const typeFilters: EnabledSearchModelType[] = enabledSearchTypes.filter(
      model => availableModels.includes(model as SearchModelType),
    );

    return isLoading ? (
      <LoadingSpinner />
    ) : (
      <Checkbox.Group
        data-testid="type-filter-checkbox-group"
        w="100%"
        value={value}
        onChange={onChange}
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
    );
  };
