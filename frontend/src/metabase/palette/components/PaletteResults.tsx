import type { Location } from "history";
import { useKBar, useMatches } from "kbar";
import { useMemo, useEffect } from "react";
import { withRouter } from "react-router";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import { Flex, Box } from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";
import type { PaletteActionImpl } from "../types";
import { processResults, navigateActionIndex } from "../utils";

import { PaletteResultItem } from "./PaletteResultItem";
import { PaletteResultList } from "./PaletteResultsList";

const PAGE_SIZE = 4;

export const PaletteResults = withRouter(
  ({ location }: { location: Location }) => {
    // Used for finding actions within the list
    const { query } = useKBar();

    useCommandPalette({ locationQuery: location.query });

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
      query.setActiveIndex(i =>
        navigateActionIndex(processedResults, i, PAGE_SIZE),
      );
    });

    useKeyPressEvent("PageUp", () => {
      query.setActiveIndex(i =>
        navigateActionIndex(processedResults, i, -PAGE_SIZE),
      );
    });

    return (
      <Flex align="stretch" direction="column" p="0.75rem 0">
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
  },
);
