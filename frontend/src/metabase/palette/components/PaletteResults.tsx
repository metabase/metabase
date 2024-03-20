import { useKBar, useMatches, KBarResults, type ActionImpl } from "kbar";
import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Flex, Box, Icon } from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";

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
        maxHeight={500}
        onRender={({
          item,
          active,
        }: {
          item: string | ActionImpl;
          active: boolean;
        }) => {
          return (
            <Flex
              bg={active ? color("brand-light") : "none"}
              c={active ? color("brand") : color("text-medium")}
              lh="1rem"
              mx="1rem"
              fw={700}
              style={{
                cursor: "pointer",
                borderRadius: "0.5rem",
              }}
            >
              {typeof item === "string" ? (
                <Box tt="uppercase" fw={700} fz="10px" p="0.5rem">
                  {item}
                </Box>
              ) : (
                <Flex
                  p=".75rem"
                  w="100%"
                  align="center"
                  justify="space-between"
                >
                  <Flex gap=".5rem">
                    {item.icon || <Icon name="click" />}
                    {item.name}
                  </Flex>
                  {active && <Icon name="enter_or_return" />}
                </Flex>
              )}
            </Flex>
          );
        }}
      />
    </Flex>
  );
};

const processResults = (results: (string | ActionImpl)[]) => {
  const groupedResults = _.groupBy(
    results.filter((r): r is ActionImpl => !(typeof r === "string")),
    "section",
  );

  const actions = processSection(t`Actions`, groupedResults["basic"]);
  const search = processSection(t`Search results`, groupedResults["search"]);
  const recent = processSection(t`Recent items`, groupedResults["recent"]);
  const admin = processSection(t`Admin`, groupedResults["admin"]);
  const docs = groupedResults["docs"] || [];

  return [...actions.slice(0, 6), ...search, ...recent, ...admin, ...docs];
};

const processSection = (sectionName: string, items?: ActionImpl[]) => {
  if (items && items.length > 0) {
    return [sectionName, ...items];
  } else {
    return [];
  }
};
