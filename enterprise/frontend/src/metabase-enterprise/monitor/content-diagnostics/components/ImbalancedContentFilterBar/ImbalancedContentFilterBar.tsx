import { Group } from "metabase/ui";
import type { ContentDiagnosticsImbalancedFindingType } from "metabase-types/api";

import { getImbalancedContentConfig } from "../../config";
import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { ImbalancedContentFilterPicker } from "../ImbalancedContentFilterPicker";
import type {
  ContentDiagnosticsFilterBarProps,
  ImbalancedContentFilterOptions,
} from "../types";

type ImbalancedContentFilterBarProps =
  ContentDiagnosticsFilterBarProps<ImbalancedContentFilterOptions> & {
    mode: ContentDiagnosticsImbalancedFindingType;
  };

export function ImbalancedContentFilterBar({
  mode,
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  onReset,
}: ImbalancedContentFilterBarProps) {
  const config = getImbalancedContentConfig(mode);
  const hasDefaultFilterOptions = config.areFilterOptionsEqual(
    filterOptions,
    config.getDefaultFilterOptions(),
  );
  const canReset = !hasDefaultFilterOptions || query !== undefined;

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
      <ImbalancedContentFilterPicker
        availableTypes={[...config.entityTypes]}
        filterOptions={filterOptions}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        canReset={canReset}
        onFilterOptionsChange={onFilterOptionsChange}
        onReset={onReset}
      />
    </Group>
  );
}
