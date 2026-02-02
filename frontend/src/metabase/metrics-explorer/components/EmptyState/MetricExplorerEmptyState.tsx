import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import { Box, Flex, Stack, Text, Title } from "metabase/ui";

export function MetricExplorerEmptyState(): JSX.Element {
  const imgSrc = getSubpathSafeUrl(
    "app/assets/img/empty-states/visualizations/line.svg",
  );

  return (
    <Flex
      w="100%"
      h="100%"
      direction="column"
      align="center"
      justify="center"
      flex={1}
    >
      <Box maw="20rem" mb="1.5rem">
        <img
          className={CS.pointerEventsNone}
          src={imgSrc}
          alt={t`Line chart illustration`}
        />
      </Box>
      <Stack gap="0.5rem" maw="25rem" ta="center" align="center">
        <Title order={4}>{t`Start exploring`}</Title>
        <Text c="text-secondary">
          {t`Use the search above to find and select metrics.`}
        </Text>
      </Stack>
    </Flex>
  );
}
