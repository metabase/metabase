import { c, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import {
  type VisualizationDisplay,
  isCardDisplayType,
} from "metabase-types/api/visualization";

import { getEmptyVizConfig } from "./utils";

export interface EmptyVizStateProps {
  chartType?: VisualizationDisplay;
  isSummarizeSidebarOpen?: boolean;
  onEditSummary?: () => void;
}

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "empty-states",
  utm_content: "empty-states-viz",
};

export const EmptyVizState = ({
  chartType,
  isSummarizeSidebarOpen,
  onEditSummary,
}: EmptyVizStateProps) => {
  const isValidChartType =
    isCardDisplayType(chartType) &&
    chartType !== "table" &&
    chartType !== "object";

  const emptyVizChart = isValidChartType ? chartType : "bar";

  const { imgSrc, primaryText, secondaryText, docsLink } =
    getEmptyVizConfig(emptyVizChart);

  const { url, showMetabaseLinks } = useDocsUrl(docsLink ?? "", {
    utm: utmTags,
  });

  const handleClick = () => {
    if (!onEditSummary) {
      return;
    }

    onEditSummary();
  };

  if (!isValidChartType) {
    return null;
  }

  const isDocsCTA = !!docsLink;
  const isSummarizeCTA = !isDocsCTA;

  return (
    <Flex
      w="100%"
      h="100%"
      direction="column"
      align="center"
      justify="center"
      data-testid="visualization-placeholder"
    >
      <Box maw="20rem" mb="3rem">
        <img
          src={imgSrc}
          alt={c("{0} refers to the chart type")
            .t`${emptyVizChart} chart example illustration`}
        />
      </Box>
      <Stack gap="0.75rem" maw="25rem" ta="center" align="center">
        {isDocsCTA && (
          <>
            <Text>{primaryText}</Text>
            {showMetabaseLinks && (
              <ExternalLink href={url}>
                <Group gap="xs">
                  <strong>{secondaryText}</strong>
                  <Icon name="external" color="brand" />
                </Group>
              </ExternalLink>
            )}
          </>
        )}

        {isSummarizeCTA && (
          <>
            <Text>{c(
              "{0} refers to the 'Summarize'. {1} refers to the follow up instructions.",
            ).jt`Click on ${
              isSummarizeSidebarOpen ? (
                <strong key="summarize">{t`Summarize`}</strong>
              ) : (
                <SummarizeCTA onClick={handleClick} key="summarize-cta" />
              )
            } at the top right corner. ${primaryText}`}</Text>
            <Text c="text-light">{secondaryText}</Text>
          </>
        )}
      </Stack>
    </Flex>
  );
};

const SummarizeCTA = ({ onClick }: { onClick: () => void }) => (
  <strong
    aria-label={t`Open summarize sidebar`}
    className={CS.link}
    onClick={onClick}
    role="button"
  >
    {t`Summarize`}
  </strong>
);
