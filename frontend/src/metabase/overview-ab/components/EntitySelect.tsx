import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  type OverviewEntityType,
  skipToken,
  useListTransformsQuery,
  useSearchQuery,
} from "metabase/api";
import {
  EntityPickerModal,
  type EntityPickerOptions,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Button,
  FixedSizeIcon,
  Group,
  Loader,
  Select,
  type SelectProps,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import { getEntityTypeLabel } from "../types";

type EntitySelectProps = {
  entityType: OverviewEntityType;
  entityId: number | undefined;
  entityName: string | undefined;
  onPick: (id: number) => void;
};

type EntityOption = { value: string; label: string };

const TABLE_PICKER_OPTIONS: EntityPickerOptions = {
  hasDatabases: true,
  hasLibrary: false,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: true,
  hasConfirmButtons: false,
};

const METRIC_PICKER_OPTIONS: EntityPickerOptions = {
  hasConfirmButtons: false,
};

const passthroughFilter: SelectProps["filter"] = ({ options }) => options;

function toOption(id: number, label: string): EntityOption {
  return { value: String(id), label };
}

export function EntitySelect({
  entityType,
  entityId,
  entityName,
  onPick,
}: EntitySelectProps) {
  const [searchValue, setSearchValue] = useState("");
  const [isBrowsing, setIsBrowsing] = useState(false);
  const searchQuery = useDebouncedValue(
    searchValue.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const isSearchable = entityType !== "transform";
  const { data: searchResponse, isFetching: isSearchFetching } = useSearchQuery(
    isSearchable
      ? {
          q: searchQuery || undefined,
          models: [entityType],
          context: "entity-picker",
          limit: 30,
        }
      : skipToken,
  );
  const { data: transforms, isFetching: isTransformsFetching } =
    useListTransformsQuery(isSearchable ? skipToken : {});

  const options = useMemo(() => {
    const found = isSearchable
      ? (searchResponse?.data ?? []).flatMap((item) =>
          typeof item.id === "number" ? [toOption(item.id, item.name)] : [],
        )
      : (transforms ?? []).map((transform) =>
          toOption(transform.id, transform.name),
        );
    // Keep the current entity selectable even when it is not in the results.
    const current =
      entityId != null &&
      !found.some((option) => option.value === String(entityId))
        ? [toOption(entityId, entityName ?? `#${entityId}`)]
        : [];
    return [...current, ...found];
  }, [isSearchable, searchResponse, transforms, entityId, entityName]);

  const handlePick = (item: OmniPickerItem) => {
    if (item.model === entityType && typeof item.id === "number") {
      setIsBrowsing(false);
      onPick(item.id);
    }
  };

  return (
    <Group gap="xs" wrap="nowrap">
      <Select
        size="xs"
        w="18rem"
        searchable
        data={options}
        value={entityId != null ? String(entityId) : null}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        // Search results are already filtered server-side; transforms use the
        // default client-side filter.
        filter={isSearchable ? passthroughFilter : undefined}
        placeholder={t`Pick a ${getEntityTypeLabel(entityType).toLowerCase()}`}
        nothingFoundMessage={t`Nothing found`}
        leftSection={<FixedSizeIcon name="search" />}
        rightSection={
          isSearchFetching || isTransformsFetching ? (
            <Loader size="xs" />
          ) : undefined
        }
        onChange={(value) => {
          const id = Number(value);
          if (Number.isInteger(id) && id > 0) {
            onPick(id);
          }
        }}
        data-testid="overview-ab-entity-select"
      />
      {isSearchable && (
        <Button size="xs" variant="subtle" onClick={() => setIsBrowsing(true)}>
          {t`Browse`}
        </Button>
      )}
      {isBrowsing && (
        <EntityPickerModal
          title={t`Pick a ${getEntityTypeLabel(entityType).toLowerCase()}`}
          models={[entityType === "table" ? "table" : "metric"]}
          options={
            entityType === "table"
              ? TABLE_PICKER_OPTIONS
              : METRIC_PICKER_OPTIONS
          }
          onChange={handlePick}
          onClose={() => setIsBrowsing(false)}
        />
      )}
    </Group>
  );
}
