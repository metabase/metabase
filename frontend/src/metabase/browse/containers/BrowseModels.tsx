import { cloneElement, useContext, useEffect, useState } from "react";

import _ from "underscore";
import cx from "classnames";
import { c, t } from "ttag";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import relativeTime from "dayjs/plugin/relativeTime";

import type { GridCellProps } from "react-virtualized";

import { Grid as VirtualizedGrid, AutoSizer } from "react-virtualized";
import type { Card, Collection, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useSearchListQuery } from "metabase/common/hooks";

import { Box, Group, Icon, Text, Title, Tooltip } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { sortModels } from "metabase/browse/utils";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import { getPageWidth } from "./utils";

import { space } from "metabase/styled-components/theme";
import {
  CenteredEmptyState,
  CollectionHeaderContainer,
  CollectionHeaderLink,
  GridContainer,
  LastEditedInfoSeparator,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseData.styled";
import NoResults from "assets/img/no_results.svg";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

const giveContext = (unit: string) =>
  c(
    `Abbreviation for "{0} ${unit}(s)". Keep abbreviations distinct from one another.`,
  );

let relativeTimeConfig: Record<string, unknown> = {
  // The following line means: Take the translation of the string "{0}min".
  // Substitute "%d" for the number. Tell dayjs to use that string when
  // describing recent dates. For example, in English, the string would
  // be "%ds". So, if theDate is a Dayjs date that is 5 minutes in the
  // past, theDate.fromNow will return "5min".
  // In Swahili, "5min" is "5 dk". "{0}min" translates to "{0} dk".
  // So "%s dk" will be the string provided to Dayjs.fromNow for
  // describing dates that are mere minutes in the past.
  // Given a date 30 minutes in the past, it will return "30 dk".
  m: giveContext("minute").t`${"%d"}min`,
  h: giveContext("hour").t`${"%d"}h`,
  d: giveContext("day").t`${"%d"}d`,
  M: giveContext("month").t`${"%d"}mo`,
  y: giveContext("year").t`${"%d"}yr`,
  // For any number of seconds, just show 1min
  s: () => giveContext("minute").t`${1}min`,
  // Don't use "ago"
  past: "%s",
  // For the edge case where a model's last-edit date is somehow in the future
  future: c("{0} is a period of time such as '5 minutes' or '5 months'")
    .t`${"%s"} from now`,
};

// Use the same abbreviations for singular and plural
relativeTimeConfig = {
  ...relativeTimeConfig,
  mm: relativeTimeConfig.m,
  hh: relativeTimeConfig.h,
  dd: relativeTimeConfig.d,
  MM: relativeTimeConfig.M,
  yy: relativeTimeConfig.y,
};

dayjs.updateLocale(dayjs.locale(), { relativeTime: relativeTimeConfig });

// TODO: Check if this is required:
// // Use a different dayjs instance to avoid polluting the global one
// const dayjsWithAbbrevs = dayjs.extend((_, { instance }) => {
//   return {
//     updateLocale(localeName, config) {
//       const locale = (instance.Ls[localeName] = {
//         ...instance.Ls[localeName],
//         ...config,
//       });
//       return locale;
//     },
//   };
// });


type RenderItemFunction = (
  props: GridCellProps & {
    columnCount: number;
    gridGapSize?: number;
    groupLabel?: string;
    cells: Cell[];
  },
) => JSX.Element | null;

const emptyArray: SearchResult[] = [];

export const BrowseModels = ({
  data: models = emptyArray,
  error,
  isLoading,
}: ReturnType<typeof useSearchListQuery<SearchResult>>) => {
  /** This provides a ref to the <main> rendered by AppContent in App.tsx */
  const contentViewport = useContext(ContentViewportContext);

  const rem = parseInt(space(2));
  const gridGapSize = 1 * rem;
  const itemMinWidth = 15 * rem;
  const defaultItemHeight = 10 * rem;
  const headerHeight = 3 * rem;

  useEffect(() => {
    const configureGrid = () => {
      if (!contentViewport) {
        return;
      }
      const gridOptions = getGridOptions(
        models,
        gridGapSize,
        itemMinWidth,
        contentViewport,
      );
      setGridOptions(gridOptions);
    };
    configureGrid();
    window.addEventListener("resize", configureGrid);
    return () => window.removeEventListener("resize", configureGrid);
  }, [models, gridGapSize, itemMinWidth, contentViewport]);

  const [gridOptions, setGridOptions] = useState<{
    cells: Cell[];
    columnCount: number;
    rowCount: number;
    width: number;
    columnWidth: number;
  } | null>(null);

  if (error) {
    return <LoadingAndErrorWrapper error />;
  } else if (isLoading || !gridOptions) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  const { cells = [], columnCount } = gridOptions;

  const getRowHeight = ({ index: rowIndex }: { index: number }) => {
    const cellIndex = rowIndex * columnCount;
    return isCellInHeaderRow(cells[cellIndex])
      ? headerHeight
      : defaultItemHeight;
  };

  const cellRenderer = (props: GridCellProps) =>
    renderItem({
      ...props,
      cells,
      columnCount,
    });

  if (cells.length && contentViewport) {
    return (
      <GridContainer role="grid">
        {({ height }: { height: number }) => (
          <AutoSizer disableHeight>
            {() => (
              <VirtualizedGrid
                data-testid="model-browser"
                columnCount={gridOptions.columnCount}
                rowCount={gridOptions.rowCount}
                width={gridOptions.width}
                columnWidth={gridOptions.columnWidth}
                gap={gridGapSize}
                autoHeight
                height={height}
                rowHeight={getRowHeight}
                cellRenderer={cellRenderer}
              />
            )}
          </AutoSizer>
        )}
      </GridContainer>
    );
  }

  return (
    <CenteredEmptyState
      title={<Box mb=".5rem">{t`No models here yet`}</Box>}
      message={
        <Box maw="24rem">{t`Models help curate data to make it easier to find answers to questions all in one place.`}</Box>
      }
      illustrationElement={
        <Box mb=".5rem">
          <img src={NoResults} />
        </Box>
      }
    />
  );
};

interface ModelCellProps {
  model: SearchResult;
  style?: React.CSSProperties;
  collectionHtmlId: string;
}

const ModelCell = ({ model, style, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const lastEditorFullName =
    model.last_editor_common_name ?? model.creator_common_name;
  const timestamp = model.last_edited_at ?? model.created_at ?? "";

  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      style={style}
      to={Urls.model(model as unknown as Partial<Card>)}
    >
      <ModelCard>
        <Title order={4} className="text-wrap" lh="1rem" mb=".5rem">
          <MultilineEllipsified id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <Text h="2rem" size="xs" mb="auto">
          <MultilineEllipsified
            tooltipMaxWidth="100%"
            className={cx({ "text-light": !model.description })}
          >
            {model.description || "No description."}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEdited
          lastEditorFullName={lastEditorFullName}
          timestamp={timestamp}
        />
      </ModelCard>
    </Link>
  );
};

const getHowLongAgo = (timestamp: string) => {
  const date = dayjs(timestamp);
  if (timestamp && date.isValid()) {
    return date.fromNow();
  } else {
    return t`(invalid date)`;
  }
};

const LastEdited = ({
  lastEditorFullName,
  timestamp,
}: {
  lastEditorFullName: string | null;
  timestamp: string;
}) => {
  const howLongAgo = getHowLongAgo(timestamp);
  const timeLabel = timestamp ? getHowLongAgo(timestamp) : "";
  const formattedDate = formatDateTimeWithUnit(timestamp, "day", {});
  const time = <time dateTime={timestamp}>{formattedDate}</time>;
  const tooltipLabel = c(
    "{0} is the full name (or if this is unavailable, the email address) of the last person who edited a model. {1} is a phrase like '5 months ago'",
  ).jt`Last edited by ${lastEditorFullName}${(<br />)}${time}`;
  return (
    <Tooltip label={tooltipLabel} withArrow disabled={!timeLabel}>
      <Text role="note" size="small">
        {lastEditorFullName}
        {lastEditorFullName && howLongAgo && (
          <LastEditedInfoSeparator>•</LastEditedInfoSeparator>
        )}
        {howLongAgo}
      </Text>
    </Tooltip>
  );
};

const CollectionHeader = ({
  collection,
  style,
  id,
}: {
  collection?: Pick<Collection, "id" | "name"> | null;
  style?: React.CSSProperties;
  id: string;
}) => {
  const MaybeLink = ({ children }: { children: React.ReactNode }) =>
    collection ? (
      <Group grow noWrap>
        <CollectionHeaderLink to={Urls.collection(collection)}>
          {children}
        </CollectionHeaderLink>
      </Group>
    ) : (
      <>{children}</>
    );
  return (
    <CollectionHeaderContainer id={id} role="heading" style={style}>
      <MaybeLink>
        <Group spacing=".33rem">
          <Icon name="folder" color={"text-dark"} size={16} />
          <Text>{collection?.name || "Untitled collection"}</Text>
        </Group>
      </MaybeLink>
    </CollectionHeaderContainer>
  );
};

type Cell = React.ReactElement | null;

const BlankCell = (props: { style?: React.CSSProperties }) => (
  <div {...props} />
);
const BlankCellInHeader = (props: { style?: React.CSSProperties }) => (
  <div {...props} />
);

const makeCells = (models: SearchResult[], columnCount: number): Cell[] => {
  const cells: Cell[] = [];
  for (
    let i = 0, columnIndex = 0;
    i < models.length;
    i++, columnIndex = (columnIndex + 1) % columnCount
  ) {
    const model = models[i];

    const collectionIdChanged =
      models[i - 1]?.collection?.id !== model.collection?.id;

    const firstModelInItsCollection =
      i === 0 || collectionIdChanged || model.collection?.id === undefined;

    /** This id is used by aria-labelledby */
    const collectionHtmlId = model?.collection?.id
      ? `collection-${model.collection?.id}`
      : `item-${cells.length}`;

    // Before the first model in a given collection,
    // add an item that represents the header of the collection
    if (firstModelInItsCollection) {
      const header = (
        <CollectionHeader
          collection={model.collection}
          key={collectionHtmlId}
          id={collectionHtmlId}
        />
      );

      // So that the collection header appears at the start of the row,
      // add zero or more blank items to fill in the rest of the previous row
      if (columnIndex > 0) {
        cells.push(
          ...Array(columnCount - columnIndex).map(j => (
            <BlankCell key={`blank-${i}-${j}`} />
          )),
        );
      }
      cells.push(header);
      // Fill in the rest of the header row with blank items
      cells.push(
        ...Array(columnCount - 1).map(j => (
          <BlankCellInHeader key={`header-blank-${i}-${j}`} />
        )),
      );
      columnIndex = 0;
    }

    cells.push(
      <ModelCell
        collectionHtmlId={collectionHtmlId}
        key={`model-${model.id}`}
        model={model}
      />,
    );
  }
  return cells;
};

const getGridOptions = (
  models: SearchResult[],
  gridGapSize: number,
  itemMinWidth: number,
  contentViewport: HTMLElement,
) => {
  const width = getPageWidth(contentViewport, gridGapSize);

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  const sortedModels = [...models.map(model => ({ ...model }))].sort(
    sortModels,
  );

  const columnCount = calculateColumnCount(width);
  const columnWidth = calculateItemWidth(width, columnCount);
  const cells = makeCells(sortedModels, columnCount);
  const rowCount = Math.ceil(cells.length / columnCount);

  return {
    cells,
    columnCount,
    columnWidth,
    rowCount,
    width,
  };
};

const renderItem: RenderItemFunction = ({
  columnCount,
  columnIndex,
  cells,
  rowIndex,
  style,
}) => {
  const index = rowIndex * columnCount + columnIndex;
  const cell = cells[index];
  return cell
    ? // Render the component with the style prop provided by the grid
      cloneElement(cell as React.ReactElement, { style })
    : null;
};

const isCellInHeaderRow = (item: Cell) =>
  item?.type === CollectionHeader || item?.type === BlankCellInHeader;
