import { useKBar, useMatches } from "kbar";
import { useEffect, useMemo } from "react";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import { Box, Flex, Stack, type StackProps } from "metabase/ui";

import type { PaletteActionImpl } from "../types";
import { navigateActionIndex, processResults } from "../utils";

import { PaletteResultItem } from "./PaletteResultItem";
import { PaletteResultList } from "./PaletteResultsList";

const PAGE_SIZE = 4;

type Props = Omit<StackProps, "children">;

export const PaletteResults = (props: Props) => {
  // Used for finding actions within the list
  const { query } = useKBar();

  const { results } = useMatches();

  const processedResults = useMemo(
    () => processResults(results as (PaletteActionImpl | string)[]),
    [results],
  );

  useEffect(() => {
    if (processedResults[0] === t`Search results`) {
      query.setActiveIndex(2);
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

  return (
    <Stack {...props}>
      <PaletteResultList
        items={processedResults} // items needs to be a stable reference, otherwise the activeIndex will constantly be hijacked
        maxHeight={530}
        onRender={({
          item,
          active,
        }: {
          item: string | PaletteActionImpl;
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
                          borderTop: "1px solid var(--mb-color-border)",
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
    </Stack>
  );
};
