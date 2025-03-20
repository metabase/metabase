import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Grid, Icon, type IconName, Text, Title } from "metabase/ui";
import { setDisplay } from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import S from "./StartFromViz.module.css";

const options = _.shuffle([
  {
    label: t`Bar`,
    value: "bar",
    icon: "bar",
  },
  {
    label: t`Line`,
    value: "line",
    icon: "line",
  },
  {
    label: t`Scatterplot`,
    value: "scatter",
    icon: "bubble",
  },
  {
    label: t`Pie`,
    value: "pie",
    icon: "pie",
  },
  {
    label: t`Funnel`,
    value: "funnel",
    icon: "funnel",
  },
]);

export function StartFromViz() {
  const dispatch = useDispatch();

  const handleVizTypeClick = useCallback(
    (nextDisplay: string) => {
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );

  return (
    <Flex direction="column" align="center">
      <Title>{t`Pick the type of viz you'd like to make`}</Title>
      <Grid mt="lg" mb="md">
        {options.map(vizType => {
          return (
            <Grid.Col key={vizType.label} span={4} miw={200} mih={180}>
              <>
                <Box
                  className={S.card}
                  onClick={() => handleVizTypeClick(vizType.value)}
                >
                  <Icon name={vizType.icon as IconName} size={32} mb="md" />
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
