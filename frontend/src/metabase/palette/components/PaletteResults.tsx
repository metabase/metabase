import { useKBar, useMatches, KBarResults } from "kbar";
import { useState } from "react";
import { useDebounce } from "react-use";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Flex, Box } from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";
import type { PaletteAction } from "../types";
import { processResults } from "../utils";

import { PaletteResultItem } from "./PaletteResultItem";

export const PaletteResults = () => {
  // Used for finding actions within the list
  const { search: query } = useKBar(state => ({ search: state.searchQuery }));
  const trimmedQuery = query.trim();

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

  const processedResults = processResults(results);

  return (
    <Flex align="stretch" direction="column" p="0.75rem 0">
      <KBarResults
        items={processedResults}
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
