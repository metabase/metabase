import { useKBar, useMatches, KBarResults } from "kbar";
import { useState, useMemo } from "react";
import { useDebounce, useKeyPressEvent } from "react-use";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Flex, Box } from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";
import type { PaletteAction } from "../types";
import { processResults, findClosesestActionIndex } from "../utils";

import { PaletteResultItem } from "./PaletteResultItem";

export const PaletteResults = () => {
  // Used for finding actions within the list
  const { searchQuery, query } = useKBar(state => ({
    searchQuery: state.searchQuery,
  }));
  const trimmedQuery = searchQuery.trim();

  // Used for finding objects across the Metabase instance
  const [debouncedSearchText, setDebouncedSearchText] = useState(trimmedQuery);

  useDebounce(
    () => {
      setDebouncedSearchText(trimmedQuery);
    },
    SEARCH_DEBOUNCE_DURATION,
    [trimmedQuery],
  );

  useCommandPalette({
    query: trimmedQuery,
    debouncedSearchText,
  });

  const { results } = useMatches();

  const processedResults = useMemo(() => processResults(results), [results]);

  useKeyPressEvent("End", () => {
    const lastIndex = processedResults.length - 1;
    query.setActiveIndex(lastIndex);
  });

  useKeyPressEvent("Home", () => {
    query.setActiveIndex(1);
  });

  useKeyPressEvent("PageDown", () => {
    query.setActiveIndex(i => findClosesestActionIndex(processedResults, i, 4));
  });

  useKeyPressEvent("PageUp", () => {
    query.setActiveIndex(i =>
      findClosesestActionIndex(processedResults, i, -4),
    );
  });

  return (
    <Flex align="stretch" direction="column" p="0.75rem 0">
      <KBarResults
        items={processedResults} // items needs to be a stable reference, otherwise the activeIndex will constantly be hijacked
        maxHeight={530}
        onRender={({
          item,
          active,
        }: {
          item: string | PaletteAction;
          active: boolean;
        }) => {
          const isFirst = processedResults[0] === item;

          return (
            <Flex lh="1rem" pb="2px">
              {typeof item === "string" ? (
                <Box
                  px="1.5rem"
                  fz="14px"
                  pt="1rem"
                  pb="0.5rem"
                  style={
                    isFirst
                      ? undefined
                      : {
                          borderTop: `1px solid ${color("border")}`,
                          marginTop: "1rem",
                        }
                  }
                  w="100%"
                >
                  {item}
                </Box>
              ) : (
                <PaletteResultItem item={item} active={active} />
              )}
            </Flex>
          );
        }}
      />
    </Flex>
  );
};
