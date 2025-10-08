import type { Query } from "history";
import { VisualState, useKBar, useMatches } from "kbar";
import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import { trackSearchClick } from "metabase/search/analytics";
import {
  Flex,
  Group,
  Icon,
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

type Props = Omit<StackProps, "children"> & {
  locationQuery: Query;
  searchRequestId: string | undefined;
  searchResults: SearchResponse | undefined;
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

  if (processedResults.length === 0) {
    return <PaletteResultsSkeleton />;
  }

  return (
    <Stack {...props}>
      <PaletteResultList
        items={processedResults} // items needs to be a stable reference, otherwise the activeIndex will constantly be hijacked
        maxHeight={530}
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

                  {item === t`Results` && searchResults?.data.length && (
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
                    >
                      <Group align="center" gap={rem(4)}>
                        <span>{t`View and filter all ${searchResults?.total} results`}</span>

                        <Icon name="chevronright" size={12} />
                      </Group>
                    </Text>
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

function PaletteResultsSkeleton() {
  return (
    <>
      <Skeleton natural height={30} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
      <Skeleton natural height={30} mt={6} radius="sm" />
    </>
  );
}
