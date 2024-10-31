import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Grid, Icon, Text, Title } from "metabase/ui";
import { setDisplay } from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import S from "./StartFromViz.module.css";

export function StartFromViz() {
  const dispatch = useDispatch();

  const handleVizTypeClick = useCallback(
    (nextDisplay: string) => {
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );
  function shuffleViz(options) {
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }

  const defaultStartingViz = [
    {
      label: "Bar",
      value: "bar",
      icon: "bar",
    },
    {
      label: t`Region Map`,
      value: "line",
      icon: "",
    },
    {
      label: t`Scatterplot`,
      value: "scatterplot",
      icon: "bubble",
    },
    {
      label: t`Pie`,
      value: "scatterplot",
      icon: "pie",
    },
    {
      label: t`Pivot table`,
      value: "pivot",
      icon: "pivot_table",
    },
    {
      label: t`Funnel`,
      value: "funnel",
      icon: "funnel",
    },
  ];

  const shuffledOptions = shuffleViz(defaultStartingViz);

  return (
    <Flex direction="column" align="center">
      <Title>{t`Pick the type of viz you'd like to make`}</Title>
      <Grid mt="lg" mb="md">
        {shuffledOptions.map(vizType => {
          return (
            <Grid.Col
              span={4}
              key={vizType.label}
              style={{ minHeight: 180, minWidth: 200 }}
            >
              <>
                <Box
                  onClick={() => handleVizTypeClick(vizType.value)}
                  className={S.card}
                >
                  <Icon name={vizType.icon} size={32} mb="md" />
                  {vizType.label}
                </Box>
              </>
            </Grid.Col>
          );
        })}
      </Grid>
      <Text>
        (
        {t`Use the panel on the left to get going with a dataset if you know what you want already`}
        )
      </Text>
    </Flex>
  );
}
