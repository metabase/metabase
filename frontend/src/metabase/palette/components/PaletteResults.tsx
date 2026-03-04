import type { Query } from "history";
import { VisualState, useKBar, useMatches } from "kbar";
import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import { trackSearchClick } from "metabase/search/analytics";
import {
  Flex,
  Group,
  Icon,
  Image,
  Skeleton,
  Stack,
  type StackProps,
  Text,
  rem,
} from "metabase/ui";
import type { SearchResponse } from "metabase-types/api";

import type { PaletteActionImpl } from "../types";
import { navigateActionIndex, processResults } from "../utils";

import S from "./Palette.module.css";
import { PaletteResultItem } from "./PaletteResultItem";
import { PaletteResultList } from "./PaletteResultsList";

const PAGE_SIZE = 4;

const FullSearchCTA = ({
  locationQuery,
  searchResults,
  searchTerm,
  onClick,
}: {
  locationQuery: Query;
  searchResults: SearchResponse;
  searchTerm: string;
  onClick: () => void;
}) => {
  const showOtherUsersCollections = useShowOtherUsersCollections();
  if (!searchResults.total && !showOtherUsersCollections) {
    return null;
  }

  const promptSearchEverything =
    !searchResults.total && showOtherUsersCollections;

  return (
    <Text
      c="brand"
      component={Link}
      fw={700}
      id="search-results-metadata"
      to={{
        pathname: "search",
        query: {
          ...locationQuery,
          q: searchTerm,
        },
      }}
      className={S.viewAndFilterResults}
      onClick={onClick}
    >
      <Group align="center" gap={rem(4)}>
        <span>
          {promptSearchEverything
            ? t`Search everything`
            : t`View and filter all ${searchResults.total} results`}
        </span>
        <Icon name="chevronright" size={12} />
      </Group>
    </Text>
  );
};

type Props = Omit<StackProps, "children"> & {
  locationQuery: Query;
  searchRequestId?: string;
  searchResults?: SearchResponse;
  searchTerm: string;
};

export const PaletteResults = ({
  locationQuery,
  searchRequestId,
  searchResults,
  searchTerm,
  ...props
}: Props) => {
  // Used for finding actions within the list
  const { query } = useKBar();

  const { results } = useMatches();

  const processedResults = useMemo(
    () => processResults(results as (PaletteActionImpl | string)[], searchTerm),
    [results, searchTerm],
  );

  useEffect(() => {
    if (processedResults[0] === t`Results`) {
      query.setActiveIndex(1);
    }
  }, [processedResults, query]);

  useKeyPressEvent("End", () => {
    query.setActiveIndex(
      navigateActionIndex(processedResults, processedResults.length, -1),
    );
  });

  useKeyPressEvent("Home", () => {
    query.setActiveIndex(navigateActionIndex(processedResults, -1, 1));
  });

  useKeyPressEvent("PageDown", () => {
    query.setActiveIndex((i) =>
      navigateActionIndex(processedResults, i, PAGE_SIZE),
    );
  });

  useKeyPressEvent("PageUp", () => {
    query.setActiveIndex((i) =>
      navigateActionIndex(processedResults, i, -PAGE_SIZE),
    );
  });

  if (processedResults.length === 0 && searchTerm.length === 0) {
    return <PaletteEmptyState />;
  }

  if (processedResults.length === 0 && searchTerm.length > 0) {
    return <PaletteResultsSkeleton />;
  }

  return (
    <Stack {...props}>
      <PaletteResultList
        items={processedResults} // items needs to be a stable reference, otherwise the activeIndex will constantly be hijacked
        maxHeight={530}
        minHeight={searchTerm.length === 0 ? 280 : 0}
        renderItem={({ item, active }) => {
          const isFirst = processedResults[0] === item;

          return (
            <Flex lh="1rem" pb="2px">
              {typeof item === "string" ? (
                <Group
                  fz="14px"
                  justify="space-between"
                  px="lg"
                  pt="md"
                  pb="sm"
                  mt={isFirst ? undefined : "md"}
                  w="100%"
                >
                  {item}

                  {item === t`Results` && searchResults && (
                    <FullSearchCTA
                      locationQuery={locationQuery}
                      searchResults={searchResults}
                      searchTerm={searchTerm}
                      onClick={() => {
                        query.setVisualState(VisualState.hidden);

                        trackSearchClick({
                          itemType: "view_more",
                          position: 0,
                          context: "command-palette",
                          searchEngine: searchResults?.engine || "unknown",
                          requestId: searchRequestId,
                          entityModel: null,
                          entityId: null,
                          searchTerm,
                        });
                      }}
                    />
                  )}
                </Group>
              ) : (
                <PaletteResultItem item={item} active={active} />
              )}
            </Flex>
          );
        }}
      />
    </Stack>
  );
};

function PaletteEmptyState() {
  return (
    <Stack align="center" justify="center" py="6rem" px="2rem" gap={0}>
      <Image src={NoResults} alt="no results" w={115} h={65} />
      <Text c="text-secondary" fw={700} mt="xl">
        {t`No recent items`}
      </Text>
      <Text c="text-tertiary" size="sm" mt="xs" ta="center">
        {t`Items you've recently viewed will appear here.`}
      </Text>
    </Stack>
  );
}

function PaletteResultsSkeleton() {
  return (
    <Stack my="3.75rem" mx="4rem">
      <Skeleton height={20} radius={4} />
      <Skeleton height={20} mt={16} radius={4} />
      <Skeleton height={20} w="80%" mt={16} radius={4} />
      <Skeleton height={20} w="80%" mt={16} radius={4} />
      <Skeleton height={20} w="60%" mt={16} radius={4} />
      <Skeleton height={20} w="60%" mt={16} radius={4} />
    </Stack>
  );
}
