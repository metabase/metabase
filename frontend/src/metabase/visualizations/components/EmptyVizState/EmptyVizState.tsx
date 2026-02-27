import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
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
  isNativeView: boolean;
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
  isNativeView,
}: EmptyVizStateProps) => {
  const isValidChartType =
    isCardDisplayType(chartType) &&
    chartType !== "table" &&
    chartType !== "object" &&
    chartType !== "list" &&
    chartType !== "boxplot";

  const emptyVizChart = isValidChartType ? chartType : "bar";

  const { imgSrc, primaryText, secondaryText, docsLink } =
    getEmptyVizConfig(emptyVizChart);

  const { url, showMetabaseLinks } = useDocsUrl(docsLink ?? "", {
    utm: utmTags,
  });

  if (!isValidChartType) {
    return null;
  }

  const hasDocsLink = !!docsLink;
  const showNativeEmptyState = !hasDocsLink && isNativeView;
  const showQBEmptyState = !hasDocsLink && !isNativeView && !!onEditSummary;

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
          className={CS.pointerEventsNone}
          src={imgSrc}
          alt={c("{0} refers to the chart type")
            .t`${emptyVizChart} chart example illustration`}
        />
      </Box>
      <Stack gap="0.75rem" maw="25rem" ta="center" align="center">
        {hasDocsLink && (
          <>
            <Text>{primaryText}</Text>
            {showMetabaseLinks && (
              <ExternalLink href={url}>
                <Group gap="xs">
                  <strong>{secondaryText}</strong>
                  <Icon name="external" c="brand" />
                </Group>
              </ExternalLink>
            )}
          </>
        )}

        {showQBEmptyState && (
          <>
            <Text>
              {c(
                "{0} refers to the 'Summarize'. {1} refers to the follow up instructions.",
              ).jt`Click on ${
                isSummarizeSidebarOpen ? (
                  <strong key="summarize">{t`Summarize`}</strong>
                ) : (
                  <SummarizeCTA onClick={onEditSummary} key="summarize-cta" />
                )
              } at the top right corner. ${primaryText}`}
            </Text>
            <Text c="text-tertiary">{secondaryText}</Text>
          </>
        )}

        {showNativeEmptyState && (
          <Text>
            {c("{0} refers to the 'settings icon'.").jt`Click on ${(
              <Icon
                name="gear"
                key="settings-icon"
                style={{ verticalAlign: "middle" }}
              />
            )} in the bottom left corner. Then pick one or more metrics for your axes.`}
          </Text>
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
