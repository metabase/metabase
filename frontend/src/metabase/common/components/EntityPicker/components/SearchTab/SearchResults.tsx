import { match } from "ts-pattern";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import { getIcon } from "metabase/lib/icon";
import { PLUGIN_MODERATION } from "metabase/plugins";
// import { trackSearchClick } from "metabase/search/analytics";
import { Box, Flex, Icon, NavLink, Stack, Text } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";

import { useOmniPickerContext } from "../../context";
import { getEntityPickerIcon, isSelectedItem } from "../../utils";

export const SearchResults = ({
  searchResults,
  isLoading,
  error,
}: {
  searchResults: SearchResult[] | RecentItem[],
  isLoading?: boolean;
  error?: unknown;
}) => {
  const { path, setPath, isDisabledItem, isSelectableItem, options, onChange } = useOmniPickerContext();
  const selectedItem = path?.[path.length - 1];

  if (!searchResults && (isLoading || error )) {
    return (
      <Box h="100%" w="40rem">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />;
      </Box>
    );
  }

  return (
    <Box h="100%" w="40rem">
      {searchResults.length > 0 ? (
        <Stack h="100%">
          <VirtualizedList
            Wrapper={({ children, ...props }) => (
              <Box py="md" {...props}>
                {children}
              </Box>
            )}
            estimatedItemSize={66}
          >
            {searchResults?.map((item) => {
              const isSelected = isSelectedItem(item, selectedItem);
              return (
                <Box key={`${item.model}-${item.id}`} pb="xs" px="sm">
                  <NavLink
                    w={"auto"}
                    disabled={isDisabledItem(item)}
                    rightSection={
                    <LocationInfo item={item} isSelected={isSelected} />
                    }
                    mb={0}
                    label={
                      <Flex align="center">
                        <Ellipsified maw="21rem">
                          {item.name}{" "}
                        </Ellipsified>
                        <PLUGIN_MODERATION.ModerationStatusIcon
                          status={item.moderated_status}
                          filled
                          size={14}
                          ml="0.5rem"
                        />
                      </Flex>
                    }
                    active={isSelected}
                    leftSection={<Icon {...getEntityPickerIcon(item, isSelected)} size={16} />}
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault(); // prevent form submission
                      e.stopPropagation(); // prevent parent onClick
                      // trackSearchClick({
                      //   itemType: "item",
                      //   position: index,
                      //   context: "entity-picker",
                      //   searchEngine: searchEngine || "unknown",
                      //   entityModel: item.model,
                      //   entityId: typeof item.id === "number" ? item.id : null,
                      //   searchTerm,
                      // });

                      setPath((prevPath) => [
                        ...prevPath.slice(0, 1),
                        item,
                      ]);

                      if (!options?.hasConfirmButtons && isSelectableItem(item)) {
                        onChange(item);
                      }
                    }}
                    variant="default"
                  />
                </Box>
              );
          })}
          </VirtualizedList>
        </Stack>
      ) : (
        <Flex direction="column" justify="center" h="100%">
          <EmptyState
            title={t`Didn't find anything`}
            message={t`There weren't any results for your search.`}
            illustrationElement={<NoObjectError mb="-1.5rem" />}
          />
        </Flex>
      )}
    </Box>
  );
};

const isInCollection = (
  item: SearchResult | RecentItem,
) => {
  return !["database", "schema", "table"].includes(item.model) || item?.collection?.name || item?.parent_collection?.name;
};

const isTableItem = (
  item: SearchResult | RecentItem,
) => {
  return item.model === "table" && "database_name" in item;
};

const LocationInfo = ({ item, isSelected }: { item: SearchResult, isSelected: boolean }) => {
  const isCollectionItem = isInCollection(item);
  const isTable = isTableItem(item);

  const collection = item.collection ?? item.parent_collection;

  const itemText = match({ isCollectionItem, isTable })
    .with({ isCollectionItem: true }, () => collection?.name ?? t`Our analytics`)
    .with({ isTable: true }, () => `${item.database_name}${item.table_schema ? ` (${item.table_schema})` : ""}`)
    .otherwise(() => null);

  if (!itemText) {
    return null;
  }

  const iconProps = isCollectionItem
    ? getIcon({
        ...item.collection,
        model: "collection",
      })
    : null;

  return (
    <Flex gap="xs" align="center">
      {iconProps && <Icon {...iconProps} size={12} />}
      <Text size="sm" c={isSelected ? "text-inverse" : "text-medium"}>
        <Ellipsified maw="12rem">{itemText}</Ellipsified>
      </Text>
    </Flex>
  );
};
