import { c, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import { isCardDisplayType } from "metabase-types/api/visualization";

import { getEmptyVizConfig } from "./utils";

interface EmptyVizStateProps {
  visualization: VisualizationDefinition;
  isSummarizeSidebarOpen?: boolean;
  onEditSummary?: () => void;
}

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "empty-states",
  utm_content: "empty-states-viz",
};

const getButtonProps = (isSummarizeSidebarOpen?: boolean) => {
  if (isSummarizeSidebarOpen) {
    return {};
  }

  return {
    className: CS.link,
    role: "button",
    "aria-label": t`Open summarize sidebar`,
  };
};

export const EmptyVizState = ({
  visualization,
  isSummarizeSidebarOpen,
  onEditSummary,
}: EmptyVizStateProps) => {
  const chartType = visualization.identifier;
  const validChartType = isCardDisplayType(chartType) ? chartType : "bar";

  const { imgSrc, primaryText, secondaryText, docsLink } =
    getEmptyVizConfig(validChartType);

  const { url, showMetabaseLinks } = useDocsUrl(docsLink ?? "", {
    utm: utmTags,
  });

  const handleClick = () => {
    if (isSummarizeSidebarOpen || !onEditSummary) {
      return;
    }

    onEditSummary();
  };

  return (
    <Flex w="100%" h="100%" direction="column" align="center" justify="center">
      <Box maw="20rem" mb="3rem">
        <img
          src={imgSrc}
          alt={c("{0} refers to the chart type")
            .t`${visualization.identifier} chart example illustration`}
        />
      </Box>
      <Stack gap="0.75rem" maw="25rem" ta="center" align="center">
        {docsLink ? (
          <>
            <Text>{primaryText}</Text>
            {showMetabaseLinks && (
              <ExternalLink href={url}>
                <Group gap="xs">
                  <b>{secondaryText}</b>
                  <Icon name="external" color="brand" />
                </Group>
              </ExternalLink>
            )}
          </>
        ) : (
          <>
            <Text>{c(
              "{0} refers to the 'Summarize'. {1} refers to the follow up instructions.",
            ).jt`Click on ${(
              <b
                {...getButtonProps(isSummarizeSidebarOpen)}
                key="summarize-cta"
                onClick={handleClick}
              >
                {t`Summarize`}
              </b>
            )} at the top right corner. ${primaryText}`}</Text>
            <Text c="text-light">{secondaryText}</Text>
          </>
        )}
      </Stack>
    </Flex>
  );
};
