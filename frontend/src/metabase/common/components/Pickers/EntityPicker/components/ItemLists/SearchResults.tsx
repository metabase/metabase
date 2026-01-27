import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import { getIcon } from "metabase/lib/icon";
import { PLUGIN_DATA_STUDIO, PLUGIN_MODERATION } from "metabase/plugins";
// import { trackSearchClick } from "metabase/search/analytics";
import { Box, Flex, Icon, NavLink, SegmentedControl, Text } from "metabase/ui";

import type { OmniPickerItem, OmniPickerTableItem, SearchScope } from "../..";
import { useOmniPickerContext } from "../../context";
import {
  useCurrentSearchScope,
  useGetLastCollection,
} from "../../hooks/use-current-search-scope";
import { getEntityPickerIcon, isSelectedItem } from "../../utils";

export const SearchResults = ({
  searchResults,
  isLoading,
  error,
  onClick,
}: {
  searchResults: OmniPickerItem[];
  isLoading?: boolean;
  error?: unknown;
  onClick?: (item: OmniPickerItem, index: number) => void;
}) => {
  const { path, setPath, isDisabledItem, isSelectableItem, options, onChange } =
    useOmniPickerContext();
  const selectedItem = path?.[path.length - 1];

  if (isLoading || error) {
    return (
      <Box h="100%" w="40rem">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />;
      </Box>
    );
  }

  if (searchResults.length === 0) {
    return (
      <EmptyState
        title={t`We didn't find anything`}
        illustrationElement={<NoObjectError mb="-1.5rem" />}
      />
    );
  }

  return (
    <VirtualizedList
      Wrapper={({ children, ...props }) => (
        <Box py="md" {...props}>
          {children}
        </Box>
      )}
      estimatedItemSize={66}
    >
      {searchResults?.map((item, index) => {
        const isSelected = isSelectedItem(item, selectedItem);
        const isSelectable = isSelectableItem(item);

        return (
          <Box
            key={`${item.model}-${item.id}`}
            pb="xs"
            px="sm"
            data-testid="result-item"
            data-model-type={item.model}
          >
            <NavLink
              w={"auto"}
              disabled={isDisabledItem(item) || !isSelectable}
              rightSection={
                <LocationInfo item={item} isSelected={isSelected} />
              }
              mb={0}
              label={
                <Flex align="center">
                  <Ellipsified maw="21rem">{item.name} </Ellipsified>
                  <PLUGIN_MODERATION.ModerationStatusIcon
                    status={"moderated_status" in item && item.moderated_status}
                    filled
                    size={14}
                    ml="0.5rem"
                  />
                </Flex>
              }
              active={isSelected}
              leftSection={
                <Icon
                  {...getEntityPickerIcon(item, { isSelected })}
                  size={16}
                />
              }
              onClick={(e: React.MouseEvent) => {
                e.preventDefault(); // prevent form submission
                e.stopPropagation(); // prevent parent onClick

                if (onClick) {
                  onClick(item, index);
                }

                if (isSelectable) {
                  setPath((prevPath) => [...prevPath.slice(0, 1), item]);

                  if (!options?.hasConfirmButtons) {
                    onChange(item);
                  }
                }
              }}
              variant="default"
            />
          </Box>
        );
      })}
    </VirtualizedList>
  );
};

const isTableInDb = (item: OmniPickerItem): item is OmniPickerTableItem => {
  return (
    item.model === "table" &&
    (!("collection" in item) || (!!item.collection && !item.collection.name))
  );
};

const getItemText = (item: OmniPickerItem) => {
  const isTable = isTableInDb(item);

  if (item.model === "schema") {
    return item.id;
  }

  if (item.model === "database") {
    return "";
  }

  return isTable
    ? `${item.database_name}${item.schema ? ` (${item.schema})` : ""}`
    : (item?.collection?.name ?? t`Our analytics`);
};

const getLocationIcon = (item: OmniPickerItem) => {
  if (
    item.model === "table" ||
    item.model === "schema" ||
    item.model === "database"
  ) {
    return null;
  }

  return getIcon({
    ...item,
    model: "collection",
  });
};

const LocationInfo = ({
  item,
  isSelected,
}: {
  item: OmniPickerItem;
  isSelected: boolean;
}) => {
  const itemText = getItemText(item);

  if (!itemText) {
    return null;
  }

  const iconProps = getLocationIcon(item);

  return (
    <Flex gap="xs" align="center">
      {iconProps && <Icon {...iconProps} size={12} />}
      <Text
        size="sm"
        c={isSelected ? "text-secondary-inverse" : "text-secondary"}
      >
        <Ellipsified maw="12rem" data-testid="picker-item-location">
          {itemText}
        </Ellipsified>
      </Text>
    </Flex>
  );
};

export function SearchScopeSelector() {
  const { setSearchScope } = useOmniPickerContext();
  const searchScope = useCurrentSearchScope();

  const { data: libraryCollection } =
    PLUGIN_DATA_STUDIO.useGetLibraryCollection();

  const lastCollection = useGetLastCollection();

  const options = [
    { label: t`Everywhere`, value: "all" },
    libraryCollection?.id
      ? { label: t`Library`, value: String(libraryCollection.id) }
      : null,
    lastCollection
      ? {
          label: truncateName(lastCollection.name, 20),
          value: String(lastCollection.id),
        }
      : null,
  ].filter((i) => i !== null);

  return (
    <Flex
      justify="space-between"
      align="center"
      px="md"
      py="sm"
      bg="background-secondary"
      mb="xs"
      data-testid="search-scope-selector"
    >
      <Text>{t`Where to search:`}</Text>
      <SegmentedControl
        value={searchScope ? String(searchScope) : "all"}
        onChange={(newValue) => setSearchScope(newValue as SearchScope)}
        data={options}
      />
    </Flex>
  );
}

const truncateName = (name: string, maxLength: number) => {
  if (name.length <= maxLength) {
    return name;
  }
  return name.slice(0, maxLength - 1) + "…";
};
