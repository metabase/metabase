import { useKBar, useMatches, KBarResults, type ActionImpl } from "kbar";
import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import type { IconName } from "metabase/ui";
import { Flex, Box, Icon } from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";
import { processResults } from "../utils";

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
          item: string | ActionImpl;
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
                <Flex
                  p=".75rem"
                  mx="1.5rem"
                  miw="0"
                  align="center"
                  justify="space-between"
                  gap="0.5rem"
                  fw={700}
                  style={{
                    cursor: "pointer",
                    borderRadius: "0.5rem",
                    flexGrow: 1,
                    flexBasis: 0,
                  }}
                  bg={active ? color("brand") : "none"}
                  c={active ? color("white") : color("text-dark")}
                >
                  <Flex gap=".5rem" style={{ minWidth: 0 }}>
                    {item.icon && (
                      <Icon
                        name={(item.icon as IconName) || "click"}
                        color={
                          active ? color("brand-light") : color("text-light")
                        }
                        style={{
                          flexBasis: "16px",
                        }}
                      />
                    )}
                    <Box
                      component="span"
                      style={{
                        flexGrow: 1,
                        flexBasis: 0,
                        textOverflow: "ellipsis",
                        overflowX: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </Box>
                  </Flex>
                  {active && (
                    <Flex
                      gap="0.5rem"
                      fw={400}
                      style={{
                        flexBasis: 60,
                      }}
                    >
                      {t`Open`} <Icon name="enter_or_return" />
                    </Flex>
                  )}
                </Flex>
              )}
            </Flex>
          );
        }}
      />
    </Flex>
  );
};
