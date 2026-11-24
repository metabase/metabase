import cx from "classnames";

import CS from "metabase/css/core/index.css";
import {
  type DashboardSketch,
  type DashboardSketchCard,
  getSketchLandingCards,
} from "metabase/dashboard/dashboard-sketch";
import {
  getIsAdditionalInfoVisible,
  getIsHeaderVisible,
} from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { buildHiddenParametersSlugSet } from "metabase/parameters/utils/ui";
import { useSelector } from "metabase/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex, Text } from "metabase/ui";
import { LEGEND_LABEL_FONT_SIZE } from "metabase/visualizations/components/legend/constants";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";

import DashboardS from "../Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";
import { GRID_GEOMETRY_STYLE } from "../DashboardGridSkeleton/DashboardGridSkeleton";
import GridS from "../DashboardGridSkeleton/DashboardGridSkeleton.module.css";
import HeaderS from "../DashboardHeader/DashboardHeaderView.module.css";
import ParametersS from "../DashboardParameterPanel/DashboardParameterPanel.module.css";

import S from "./DashboardSketchSamples.module.css";

/*
 * Dashboard parts drawn from a sketch of the dashboard as last shown, for
 * skullet to measure into a skeleton. Text is filler of the real text's
 * length, so each bar is as long as the line it stands in for.
 */

// For a dashboard never shown before: a typical title and edit history
const DEFAULT_TITLE = "Xxxxxxxxx xxxxxxxx";

// Dashboards render a fixed row of action-icon buttons in their header.
const HEADER_ACTIONS = Array.from({ length: 6 });

// Skullet paints an element with this attribute as is, rather than drawing a
// skeleton over it
const SKULLET_OWN = { "skullet-own": "" };

// Filler as long as a typical "Edited 3 days ago by Jane Doe" label
const LAST_EDIT_INFO_FILLER = "Xxxxxx 0 xxxx xxx xx Xxxx Xxx";

export const DashboardHeaderSample = ({
  sketch,
  titled,
}: {
  sketch: DashboardSketch | null;
  titled: boolean;
}) => {
  const isHeaderVisible = useSelector(getIsHeaderVisible);
  const isAdditionalInfoVisible = useSelector(getIsAdditionalInfoVisible);
  const isFixedWidth = sketch?.isFixedWidth ?? true;
  const hasLastEditInfo = sketch?.hasLastEditInfo ?? true;
  const tabs = sketch?.tabs ?? [];

  return (
    <div className={HeaderS.DashboardHeader}>
      <div className={HeaderS.HeaderContainer}>
        {isHeaderVisible && (
          <FullWidthContainer className={cx(CS.wrapper, HeaderS.HeaderRow)}>
            <FixedWidthContainer
              className={HeaderS.HeaderFixedWidthContainer}
              isFixedWidth={isFixedWidth}
            >
              {titled && (
                // The real header mounts with its sub-header shown.
                <Box
                  className={cx(HeaderS.HeaderContent, HeaderS.showSubHeader)}
                >
                  <Flex className={HeaderS.HeaderCaptionContainer}>
                    <div className={cx(HeaderS.HeaderCaption, S.headerTitle)}>
                      {sketch?.title ?? DEFAULT_TITLE}
                    </div>
                  </Flex>
                  <Flex className={HeaderS.HeaderBadges}>
                    {hasLastEditInfo && isAdditionalInfoVisible && (
                      <Text
                        className={HeaderS.HeaderLastEditInfoLabel}
                        size="sm"
                        fw="bold"
                      >
                        {LAST_EDIT_INFO_FILLER}
                      </Text>
                    )}
                  </Flex>
                </Box>
              )}
              <Flex className={HeaderS.HeaderButtonsContainer}>
                <Flex className={HeaderS.HeaderButtonSection}>
                  {HEADER_ACTIONS.map((_, index) => (
                    <Box
                      key={index}
                      skullet-block=""
                      w="2rem"
                      h="2rem"
                      bdrs="sm"
                    />
                  ))}
                </Flex>
              </Flex>
            </FixedWidthContainer>
          </FullWidthContainer>
        )}
        {tabs.length > 1 && (
          <FullWidthContainer className={HeaderS.HeaderRow}>
            <FixedWidthContainer
              className={HeaderS.HeaderFixedWidthContainer}
              isFixedWidth={isFixedWidth}
            >
              <Flex align="center" gap="lg" h="2.5rem">
                {tabs.map((tab) => (
                  <Text key={tab.id} fw="bold">
                    {tab.name}
                  </Text>
                ))}
              </Flex>
            </FixedWidthContainer>
          </FullWidthContainer>
        )}
      </div>
    </div>
  );
};

/** The header filters of a sketch, less those the embed hides. */
export const getSketchVisibleParameters = (
  sketch: DashboardSketch | null,
  hideParameters: string | null | undefined,
) => {
  const hiddenSlugs = buildHiddenParametersSlugSet(hideParameters);
  return (sketch?.parameters ?? []).filter(
    (parameter) => !hiddenSlugs.has(parameter.slug),
  );
};

export const DashboardParametersSample = ({
  sketch,
  hideParameters,
}: {
  sketch: DashboardSketch;
  hideParameters: string | null | undefined;
}) => (
  <FullWidthContainer
    className={cx(ParametersS.ParametersWidgetContainer, {
      [ParametersS.isEmbeddingSdk]: isEmbeddingSdk(),
    })}
  >
    <FixedWidthContainer
      className={DashboardS.ParametersFixedWidthContainer}
      isFixedWidth={sketch.isFixedWidth}
    >
      <Flex align="center" gap="sm" wrap="wrap">
        {getSketchVisibleParameters(sketch, hideParameters).map((parameter) => (
          <Flex
            key={parameter.id}
            align="center"
            h={32}
            px="sm"
            bd="1px solid var(--mb-color-border-neutral)"
            bdrs="xs"
          >
            <Text size="sm" fw="bold">
              {parameter.name}
            </Text>
          </Flex>
        ))}
      </Flex>
    </FixedWidthContainer>
  </FullWidthContainer>
);

const ChartCardSample = ({
  card,
}: {
  card: Extract<DashboardSketchCard, { kind: "chart" }>;
}) => {
  // Number cards draw their title inside the chart, without a header row,
  // and their skeleton fills the card unpadded, as in DashCardLoadingView.
  const isScalar = card.display === "scalar" || card.display === "smartscalar";
  const title =
    !isScalar && card.title ? (
      <Text fw="bold" fz={LEGEND_LABEL_FONT_SIZE} truncate>
        {card.title}
      </Text>
    ) : null;

  return (
    <>
      {/* The card's frame and its chart skeleton, painted as is rather than
          measured, so the chart keeps its shape */}
      <div {...SKULLET_OWN} className={S.frame}>
        {title && (
          <div className={cx(S.title, S.titleSpacer)} aria-hidden>
            {title}
          </div>
        )}
        <Box
          flex="1 1 0"
          mih={0}
          className={cx(!isScalar && cx(CS.px2, CS.pb2))}
        >
          <ChartSkeleton display={card.display} />
        </Box>
      </div>
      {title && <div className={S.title}>{title}</div>}
    </>
  );
};

const TextCardSample = ({
  card,
}: {
  card: Extract<DashboardSketchCard, { kind: "text" }>;
}) => (
  <div
    className={cx(GridS.textContent, {
      [GridS.textContentHeading]: card.isHeading,
    })}
  >
    {card.lines.map((line, index) =>
      line.length === 0 ? (
        <Box key={index} h="1.2em" />
      ) : (
        <Text key={index} fz="inherit" fw={card.isHeading ? "bold" : undefined}>
          {line}
        </Text>
      ),
    )}
  </div>
);

/** The cards of the tab the dashboard opens on, at their grid positions. */
export const DashboardGridSample = ({
  sketch,
}: {
  sketch: DashboardSketch;
}) => {
  const cards = getSketchLandingCards(sketch);
  const rows = cards.reduce(
    (count, { row, size_y }) => Math.max(count, row + size_y),
    0,
  );

  return (
    <FixedWidthContainer isFixedWidth={sketch.isFixedWidth}>
      <Box className={GridS.root}>
        <Box
          className={GridS.grid}
          style={{ ...GRID_GEOMETRY_STYLE, "--skeleton-rows": rows }}
        >
          {cards.map((card, index) => (
            <Box
              key={index}
              className={cx(GridS.card, S.frameless)}
              style={{
                "--skeleton-col": card.col,
                "--skeleton-row": card.row,
                "--skeleton-w": card.size_x,
                "--skeleton-h": card.size_y,
              }}
            >
              {card.kind === "text" ? (
                <TextCardSample card={card} />
              ) : (
                <ChartCardSample card={card} />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </FixedWidthContainer>
  );
};
