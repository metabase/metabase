import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  type IconName,
  Loader,
  Menu,
  Popover,
  PopoverBackButton,
  Stack,
  Text,
} from "metabase/ui";
import C from "metabase/visualizations/components/ClickActions/ClickActionControl.module.css";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  DatasetColumn,
  RawSeries,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { ALL_DRILLS_CLICK_MODE } from "../../harness/drillMode";

import {
  type DrillAction,
  type DrillMenuModel,
  type DrillOption,
  type DrillOptionTarget,
  getDrillMenu,
  rowCountQuery,
} from "./drillMenu";

const CHART_HEIGHT = 420;

type QuestionChartProps = {
  query: Lib.Query;
  display: CardDisplayType;
  /** `false` shows today's drill-through popover instead of the new menu. */
  hasNewMenu?: boolean;
  /** "nested" folds the filters behind one "Filter" entry; "flat" lists them under the drills. */
  menuLayout?: "nested" | "flat";
  onPick: (query: Lib.Query, target: DrillOptionTarget) => void;
  /** Today's popover produced a new query. */
  onLegacyDrill?: (query: Lib.Query) => void;
  /** The query a picked option applies to, when the chart shows a different one. */
  pickQuery?: Lib.Query;
  /** A table's column header was clicked. */
  onHeaderClick?: (column: DatasetColumn, element: Element) => void;
  /** Sits right after the legend's last item; under the chart when there is no legend. */
  legendAccessory?: ReactNode;
  /** Drawn around the whole legend row; a `[data-legend-lead]` inside it pushes the items along. */
  legendWrap?: (frame: LegendFrame) => ReactNode;
  /**
   * Drawn in place of each y-axis title that names a measure, which it hides.
   * One measure gets a title even when split into series.
   */
  yAxisTitle?: (frame: AxisTitleFrame) => ReactNode;
};

type OpenMenu = { model: DrillMenuModel; x: number; y: number };

/**
 * The question's chart. Clicking a bar or point opens a menu phrased with the
 * values you clicked; hovering an option previews how many rows or bars it
 * leaves.
 */
export function QuestionChart({
  query,
  display,
  hasNewMenu = true,
  menuLayout = "nested",
  onPick,
  onLegacyDrill,
  pickQuery = query,
  onHeaderClick,
  legendAccessory,
  legendWrap,
  yAxisTitle,
}: QuestionChartProps) {
  const metadataProvider = useMetadataProviderUnfiltered(Lib.databaseID(query));
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const [menu, setMenu] = useState<OpenMenu>();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureNames = useMemo(() => getMeasureNames(query), [query]);
  const axisTitles = useYAxisTitles(
    containerRef,
    yAxisTitle != null ? measureNames : undefined,
  );
  const legendEnd = useLegendEnd(
    containerRef,
    legendAccessory != null || legendWrap != null,
    legendWrap != null ? wrapRef : undefined,
  );

  const MenuComponent = menuLayout === "flat" ? DrillMenu : NestedDrillMenu;
  const isAggregated = Lib.aggregations(query, 0).length > 0;
  const effectiveDisplay = getEffectiveDisplay(query, display);
  const groupCount = result.data?.data?.rows.length ?? 0;
  const markNoun = effectiveDisplay === "line" ? t`points` : t`bars`;

  const hasYAxisTitles = yAxisTitle != null;
  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!result.data?.data || result.data.data.cols.length === 0) {
      return undefined;
    }
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery,
          display: effectiveDisplay,
          visualization_settings:
            // The app only titles an axis with one series on it.
            hasYAxisTitles && measureNames.length === 1
              ? { "graph.y_axis.title_text": measureNames[0] }
              : {},
        }),
        data: result.data.data,
      },
    ];
  }, [result.data, jsQuery, effectiveDisplay, hasYAxisTitles, measureNames]);

  const handleClick = (clicked: Lib.ClickObject | null) => {
    if (
      onHeaderClick &&
      clicked?.column &&
      clicked.element &&
      clicked.value === undefined
    ) {
      onHeaderClick(clicked.column, clicked.element);
      return;
    }
    const event = clicked?.event;
    const model = clicked
      ? getDrillMenu({ query, clicked, groupCount, markNoun })
      : undefined;
    setMenu(
      model && event
        ? { model, x: event.clientX, y: event.clientY }
        : undefined,
    );
  };

  const errorMessage =
    result.error != null
      ? getErrorMessage(result.error)
      : result.data?.status === "failed"
        ? (result.data.error ?? t`Query failed`)
        : undefined;

  return (
    <>
      {legendAccessory && !legendEnd && <Box mb="sm">{legendAccessory}</Box>}
      <Box
        ref={containerRef}
        h={CHART_HEIGHT}
        pos="relative"
        style={{
          opacity: result.isFetching ? 0.5 : 1,
          transition: "opacity 150ms",
        }}
      >
        {errorMessage && (
          <Text c="feedback-negative">{String(errorMessage)}</Text>
        )}
        {rawSeries ? (
          <Visualization
            queryBuilderMode="dataset"
            rawSeries={rawSeries}
            mode={ALL_DRILLS_CLICK_MODE}
            handleVisualizationClick={
              hasNewMenu && isAggregated ? handleClick : undefined
            }
            onChangeCardAndRun={({ nextCard }) =>
              onLegacyDrill?.(
                Lib.fromJsQuery(metadataProvider, nextCard.dataset_query),
              )
            }
          />
        ) : (
          result.isFetching && <Loader />
        )}
        {legendWrap && legendEnd && (
          <Box
            ref={wrapRef}
            pos="absolute"
            left={0}
            top={legendEnd.top}
            style={{
              transform: "translateY(-50%)",
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            {legendWrap({
              width: legendEnd.left + LEGEND_WRAP_PADDING,
              row: legendEnd.row,
            })}
          </Box>
        )}
        {yAxisTitle &&
          axisTitles.map((axisTitle) => (
            <Box
              key={axisTitle.text}
              pos="absolute"
              left={axisTitle.centerX}
              top={axisTitle.centerY}
              style={{ transform: "translate(-50%, -50%)", zIndex: 1 }}
            >
              {yAxisTitle(axisTitle)}
            </Box>
          ))}
        {legendAccessory && legendEnd && (
          <Box
            pos="absolute"
            left={legendEnd.left + LEGEND_ACCESSORY_GAP}
            top={legendEnd.top}
            style={{ transform: "translateY(-50%)", zIndex: 1 }}
          >
            {legendAccessory}
          </Box>
        )}
        {menu && (
          <MenuComponent
            menu={menu}
            query={query}
            markNoun={markNoun}
            onClose={() => setMenu(undefined)}
            onPick={(option) => {
              setMenu(undefined);
              onPick(option.apply(pickQuery), option.target);
            }}
            onAction={(nextQuery) => {
              setMenu(undefined);
              onPick(nextQuery, "records");
            }}
          />
        )}
      </Box>
    </>
  );
}

const LEGEND_ACCESSORY_GAP = 12;
const LEGEND_WRAP_PADDING = 10;

export type AxisTitleFrame = {
  /** The measure the axis plots, as titled. */
  text: string;
  centerX: number;
  centerY: number;
  fontSize: string;
};

/** The display names of the measures the chart plots. */
function getMeasureNames(query: Lib.Query): string[] {
  const stages = Array.from({ length: Lib.stageCount(query) }, (_, i) => i);
  const stage = stages
    .filter((stage) => Lib.aggregations(query, stage).length > 0)
    .at(-1);
  if (stage == null) {
    return [];
  }
  return Lib.returnedColumns(query, stage)
    .map((column) => Lib.displayInfo(query, stage, column))
    .filter((info) => info.isAggregation)
    .map((info) => info.displayName);
}

/** The y-axis titles: labels turned a quarter that name a measure. */
function findYAxisTitles(
  container: HTMLElement,
  measureNames: string[],
): SVGTextElement[] {
  return Array.from(container.querySelectorAll("svg text")).filter(
    (text): text is SVGTextElement => {
      if (
        !(text instanceof SVGTextElement) ||
        !measureNames.includes(text.textContent?.trim() ?? "")
      ) {
        return false;
      }
      const matrix = text.transform.baseVal.consolidate()?.matrix;
      return matrix != null && Math.abs(matrix.a) < 0.01;
    },
  );
}

/**
 * Where the chart's y-axis titles sit, relative to the container, kept up to
 * date as the chart re-renders. The titles themselves are hidden so a
 * component can take their place.
 */
function useYAxisTitles(
  containerRef: RefObject<HTMLDivElement>,
  measureNames: string[] | undefined,
): AxisTitleFrame[] {
  const [frames, setFrames] = useState<AxisTitleFrame[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !measureNames) {
      setFrames([]);
      return;
    }
    const update = () => {
      const containerRect = container.getBoundingClientRect();
      const nextFrames = findYAxisTitles(container, measureNames).map(
        (title) => {
          title.style.visibility = "hidden";
          const rect = title.getBoundingClientRect();
          return {
            text: title.textContent?.trim() ?? "",
            centerX: Math.round(
              rect.left - containerRect.left + rect.width / 2,
            ),
            centerY: Math.round(rect.top - containerRect.top + rect.height / 2),
            fontSize: getComputedStyle(title).fontSize,
          };
        },
      );
      setFrames((previous) =>
        _.isEqual(previous, nextFrames) ? previous : nextFrames,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef, measureNames]);

  return frames;
}

export type LegendFrame = { width: number; row: HTMLElement };

type LegendEnd = {
  left: number;
  top: number;
  row: HTMLElement;
  leadWidth: number;
};

/**
 * Where the chart's legend ends, relative to the container, kept up to date as
 * the chart re-renders. The legend row is moved above the chart, left-aligned,
 * so the accessory reads as the legend's last entry.
 */
function useLegendEnd(
  containerRef: RefObject<HTMLDivElement>,

  isEnabled: boolean,
  wrapRef?: RefObject<HTMLDivElement>,
): LegendEnd | undefined {
  const [legendEnd, setLegendEnd] = useState<LegendEnd>();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !isEnabled) {
      return;
    }
    const update = () => {
      const items = container.querySelectorAll('[data-testid="legend-item"]');
      const lastItem = items[items.length - 1];
      const lead =
        wrapRef?.current?.querySelector<HTMLElement>("[data-legend-lead]");
      const leadWidth = lead ? lead.offsetWidth + LEGEND_ACCESSORY_GAP : 0;
      if (!lastItem) {
        setLegendEnd(undefined);
        return;
      }
      const legendRow =
        lastItem.closest<HTMLElement>('[data-testid="legend-horizontal"]') ??
        lastItem.parentElement;
      if (!legendRow) {
        setLegendEnd(undefined);
        return;
      }
      Object.assign(legendRow.style, {
        order: "-1",
        justifyContent: "flex-start",
        marginTop: "0",
        marginBottom: "0.75rem",
        // Wrapped, the pill starts at the chart's edge, so no indent.
        ...(wrapRef && {
          marginLeft: "0",
          paddingLeft: `${LEGEND_WRAP_PADDING + leadWidth}px`,
        }),
      });
      const containerRect = container.getBoundingClientRect();
      const itemRect = lastItem.getBoundingClientRect();
      const left = Math.round(itemRect.right - containerRect.left);
      const top = Math.round(
        itemRect.top - containerRect.top + itemRect.height / 2,
      );
      setLegendEnd((previous) =>
        previous?.left === left &&
        previous.top === top &&
        previous.row === legendRow &&
        previous.leadWidth === leadWidth
          ? previous
          : { left, top, row: legendRow, leadWidth },
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef, isEnabled, wrapRef]);

  return legendEnd;
}

/** Row filters land in the filter bar; thresholds land in the summary's "Show if". */
const OPTION_SECTIONS = [
  { target: "rows", title: () => t`Filter` },
  { target: "summary", title: () => t`Show if…` },
] as const;

type DrillMenuProps = {
  menu: OpenMenu;
  query: Lib.Query;
  markNoun: string;
  onClose: () => void;
  onPick: (option: DrillOption) => void;
  onAction: (query: Lib.Query) => void;
};

/**
 * Today's drill-throughs on top, unchanged except for the operator buttons;
 * under them, one short line per filter, each naming its value.
 */
function DrillMenu({
  menu,
  query,
  markNoun,
  onClose,
  onPick,
  onAction,
}: DrillMenuProps) {
  const [previewId, setPreviewId] = useState<string>();
  const { model } = menu;

  return (
    <Menu
      opened
      onChange={(opened) => !opened && onClose()}
      position="bottom-start"
      width={260}
    >
      <Menu.Target>
        <Box pos="fixed" left={menu.x} top={menu.y} w={1} h={1} />
      </Menu.Target>
      <Menu.Dropdown>
        <Group px="sm" pt="xs" pb="xs" gap="xs" wrap="nowrap">
          <Text fw="bold" size="sm" truncate>
            {model.header.join(" · ")}
          </Text>
          {model.measure && (
            <Text size="sm" c="text-secondary" ml="auto" truncate>
              {model.measure}
            </Text>
          )}
        </Group>
        {model.actions.map((action) => (
          <DrillActionItem key={action.id} action={action} onPick={onAction} />
        ))}
        {OPTION_SECTIONS.map(({ target, title }) => {
          const options = model.options.filter(
            (option) => option.target === target,
          );
          if (options.length === 0) {
            return null;
          }
          return (
            <Box key={target}>
              <Menu.Divider />
              <Menu.Label>{title()}</Menu.Label>
              {options.map((option) => (
                <Menu.Item
                  key={option.id}
                  py="xs"
                  title={option.detail}
                  leftSection={
                    target === "rows" ? (
                      <Icon name="filter" color="core-brand" />
                    ) : undefined
                  }
                  onMouseEnter={() => setPreviewId(option.id)}
                  onFocus={() => setPreviewId(option.id)}
                  onClick={() => onPick(option)}
                  rightSection={
                    previewId === option.id ? (
                      <PreviewCount
                        query={option.apply(query)}
                        target={option.target}
                        markNoun={markNoun}
                      />
                    ) : undefined
                  }
                >
                  <Text size="sm">{option.title}</Text>
                </Menu.Item>
              ))}
            </Box>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Rows render as a table whatever was asked for, and a summary with nothing
 * to break out by (a lone "Sum of Total") as a scalar, since a bar or line
 * has no axis to draw it on.
 */
function getEffectiveDisplay(
  query: Lib.Query,
  display: CardDisplayType,
): CardDisplayType {
  if (Lib.aggregations(query, 0).length === 0) {
    return "table";
  }
  if (Lib.breakouts(query, 0).length === 0) {
    return "scalar";
  }
  return display;
}

/** Today's column picker under "Break out by…" is this wide. */
const SUBMENU_MIN_WIDTH = 300;

/** A submenu that replaces the main list, like today's popover. */
type NestedView = { kind: "action"; action: DrillAction } | { kind: "filter" };

/**
 * Today's drill-through popover: same layout and type, submenus replace the
 * list behind a back button. Every filter sits behind one "Filter" entry
 * under "Break out by…".
 */
function NestedDrillMenu({ menu, onClose, onPick, onAction }: DrillMenuProps) {
  const [views, setViews] = useState<NestedView[]>([]);
  const view = views.at(-1);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const openView = (next: NestedView) => setViews([...views, next]);
  const goBack = () => setViews(views.slice(0, -1));

  const handleAction = (action: DrillAction) => {
    if (action.children) {
      openView({ kind: "action", action });
    } else if (action.apply) {
      onAction(action.apply());
    } else if (action.onSelect) {
      action.onSelect();
      onClose();
    }
  };

  return (
    <Popover
      opened
      onChange={(opened) => !opened && onClose()}
      position="bottom-start"
      offset={8}
    >
      <Popover.Target>
        <Box pos="fixed" left={menu.x} top={menu.y} w={1} h={1} />
      </Popover.Target>
      <Popover.Dropdown mah="65vh" style={{ overflowX: "hidden" }}>
        <Stack
          gap="sm"
          px="xl"
          py="lg"
          fw={700}
          miw={view ? SUBMENU_MIN_WIDTH : undefined}
        >
          {view && (
            <PopoverBackButton mb="sm" onClick={goBack}>
              {view.kind === "filter" ? t`Filter…` : view.action.title}
            </PopoverBackButton>
          )}
          {view == null && (
            <NestedMainView
              model={menu.model}
              onAction={handleAction}
              onFilter={() => openView({ kind: "filter" })}
            />
          )}
          {view?.kind === "filter" && (
            <NestedFilterView options={menu.model.options} onPick={onPick} />
          )}
          {view?.kind === "action" && (
            <>
              {view.action.children?.map((child) => (
                <NestedMenuButton
                  key={child.id}
                  icon={child.icon}
                  onClick={() => handleAction(child)}
                >
                  {child.title}
                </NestedMenuButton>
              ))}
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

type NestedMainViewProps = {
  model: DrillMenuModel;
  onAction: (action: DrillAction) => void;
  onFilter: () => void;
};

function NestedMainView({ model, onAction, onFilter }: NestedMainViewProps) {
  const filterIndex =
    model.actions.findIndex((action) => action.id === "pivot") + 1;
  const hasFilter = model.options.length > 0;
  return (
    <>
      {model.actions.map((action, index) => (
        <Fragment key={action.id}>
          {hasFilter && index === filterIndex && (
            <NestedMenuButton icon="filter" onClick={onFilter}>
              {t`Filter…`}
            </NestedMenuButton>
          )}
          <NestedMenuButton icon={action.icon} onClick={() => onAction(action)}>
            {action.title}
          </NestedMenuButton>
        </Fragment>
      ))}
    </>
  );
}

type NestedFilterViewProps = {
  options: DrillOption[];
  onPick: (option: DrillOption) => void;
};

/** Row filters, then a divider, then the summary's thresholds. */
function NestedFilterView({ options, onPick }: NestedFilterViewProps) {
  const groups = OPTION_SECTIONS.map(({ target }) =>
    options.filter((option) => option.target === target),
  ).filter((group) => group.length > 0);

  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group[0].target}>
          {index > 0 && <Divider mx="-xl" my="xs" />}
          {group.map((option) => (
            <NestedMenuButton
              key={option.id}
              title={option.detail}
              onClick={() => onPick(option)}
            >
              {option.title}
            </NestedMenuButton>
          ))}
        </Fragment>
      ))}
    </>
  );
}

type NestedMenuButtonProps = {
  icon?: IconName;
  title?: string;
  children: ReactNode;
  onClick: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
};

/** The "horizontal" button of today's popover. */
function NestedMenuButton({
  icon,
  title,
  children,
  onClick,
  onMouseEnter,
  onFocus,
}: NestedMenuButtonProps) {
  return (
    <Button
      p="0.5rem"
      mx="-0.5rem"
      variant="subtle"
      color="neutral"
      classNames={{
        root: C.horizontalButton,
        label: C.label,
        inner: C.inner,
      }}
      leftSection={
        icon ? (
          <Icon className={C.clickActionButtonIcon} name={icon} m={0} />
        ) : null
      }
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
    >
      {children}
    </Button>
  );
}

type DrillActionItemProps = {
  action: DrillAction;
  onPick: (query: Lib.Query) => void;
};

function DrillActionItem({ action, onPick }: DrillActionItemProps) {
  const icon = <Icon name={action.icon} color="core-brand" />;
  if (!action.children) {
    return (
      <Menu.Item
        leftSection={icon}
        onClick={() =>
          action.apply ? onPick(action.apply()) : action.onSelect?.()
        }
      >
        <Text size="sm" fw="bold">
          {action.title}
        </Text>
      </Menu.Item>
    );
  }
  return (
    <Menu.Sub position="right-start">
      <Menu.Sub.Target>
        <Menu.Sub.Item leftSection={icon}>
          <Text size="sm" fw="bold">
            {action.title}
          </Text>
        </Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown mah="60vh" style={{ overflowY: "auto" }}>
        {action.children.map((child) => (
          <DrillActionItem key={child.id} action={child} onPick={onPick} />
        ))}
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
}

type PreviewCountProps = {
  query: Lib.Query;
  target: DrillOptionTarget;
  markNoun: string;
};

/** Row filters count rows; thresholds count the bars that survive. */
function PreviewCount({ query, target, markNoun }: PreviewCountProps) {
  const countJsQuery = useMemo(
    () =>
      Lib.toJsQuery(
        target === "summary"
          ? Lib.aggregateByCount(Lib.appendStage(query), -1)
          : rowCountQuery(query),
      ),
    [query, target],
  );
  const result = useGetAdhocQueryQuery({ ...countJsQuery, ignore_error: true });
  const count = result.data?.data?.rows?.[0]?.[0];
  if (result.isFetching || typeof count !== "number") {
    return <Loader size="xs" />;
  }
  const noun = target === "summary" ? markNoun : t`rows`;
  return (
    <Text size="xs" c="text-secondary" style={{ whiteSpace: "nowrap" }}>
      {`→ ${count.toLocaleString()} ${noun}`}
    </Text>
  );
}
