import {
  type Dispatch,
  type SetStateAction,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import type {
  MiniPickerItem,
  MiniPickerPickableItem,
} from "metabase/common/components/Pickers/MiniPicker/types";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { MenuProps } from "metabase/ui";
import type { SearchRequest } from "metabase-types/api";

import type { SelectedMetric } from "../../../types/viewer-state";
import { createSourceId } from "../../../utils/source-ids";
import type { MetricNameMap } from "../utils";

export interface MetricSearchDropdownRef {
  onArrowDown: () => boolean;
  onArrowUp: () => boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

type MetricSearchDropdownProps = {
  anchorRect?: { left: number; top: number };
  onSelect: (metric: SelectedMetric) => void;
  onClose: () => void;
  searchQuery?: string;
  selectedMetric?: SelectedMetric;
  menuProps?: MenuProps;
  setSearchMetricNames?: Dispatch<SetStateAction<MetricNameMap>>;
};

// needs to be stable, otherwise onSearchResults calling setSearchMetricNames creates an infinite loop
const MINI_PICKER_MODELS = ["metric" as const, "measure" as const];

export const MetricSearchDropdown = forwardRef<
  MetricSearchDropdownRef,
  MetricSearchDropdownProps
>(function MetricSearchDropdown(
  {
    anchorRect,
    onSelect,
    onClose,
    searchQuery,
    selectedMetric,
    menuProps,
    setSearchMetricNames,
  },
  ref,
) {
  const [isBrowsing, setIsBrowsing] = useState(false);

  const libraryMetricsCollection =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  const getSearchParams = useCallback(
    (params: SearchRequest): Partial<SearchRequest> => {
      const scopeMiniPickerToLibraryMetrics =
        libraryMetricsCollection !== undefined &&
        (libraryMetricsCollection.here?.includes("metric") ||
          libraryMetricsCollection.below?.includes("metric")) &&
        !params.q;

      return {
        limit: 5,
        ...(scopeMiniPickerToLibraryMetrics
          ? { collection: libraryMetricsCollection.id }
          : {}),
      };
    },
    [libraryMetricsCollection],
  );

  const miniPickerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    onArrowDown: () => {
      const firstElement =
        miniPickerRef.current?.querySelector('[role="menuitem"]');
      if (firstElement) {
        (firstElement as HTMLElement).focus();
      }
      return true;
    },
    onArrowUp: () => {
      const elements =
        miniPickerRef.current?.querySelectorAll('[role="menuitem"]') ?? [];
      const lastElement = elements[elements.length - 1];
      if (lastElement) {
        (lastElement as HTMLElement).focus();
      }
      return true;
    },
    containerRef: miniPickerRef,
  }));

  const handleSearchResults = useCallback(
    (results: MiniPickerPickableItem[]) => {
      setSearchMetricNames?.((prev) => ({
        ...prev,
        ...Object.fromEntries(
          results
            .filter(
              (
                result,
              ): result is {
                id: number;
                model: "metric" | "measure";
                name: string;
              } => result.model === "metric" || result.model === "measure",
            )
            .map((result) => [
              createSourceId(result.id, result.model),
              result.name,
            ]),
        ),
      }));
    },
    [setSearchMetricNames],
  );

  useUnmount(() => {
    setSearchMetricNames?.({});
  });

  const handleSelectResult = useCallback(
    (item: OmniPickerItem) => {
      if (item.model !== "metric" && item.model !== "measure") {
        return;
      }
      if (typeof item.id !== "number") {
        return;
      }
      onSelect({
        id: item.id,
        name: item.name,
        sourceType: item.model,
      });
    },
    [onSelect],
  );

  const shouldHide = useCallback(
    (item: MiniPickerItem | unknown) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("id" in item) ||
        !("model" in item)
      ) {
        return true;
      }
      if (selectedMetric) {
        return (
          item.id === selectedMetric.id &&
          item.model === selectedMetric.sourceType
        );
      }
      return false;
    },
    [selectedMetric],
  );

  return (
    <>
      <MiniPicker
        opened={!isBrowsing}
        searchQuery={searchQuery}
        onChange={handleSelectResult}
        onClose={onClose}
        models={MINI_PICKER_MODELS}
        onBrowseAll={() => setIsBrowsing(true)}
        forceSearch={true}
        showSearchInput={searchQuery === undefined}
        searchInputPlaceholder={t`Search metrics and measures…`}
        searchParams={getSearchParams}
        onSearchResults={handleSearchResults}
        shouldHide={shouldHide}
        menuProps={menuProps}
        menuDropdownRef={miniPickerRef}
      >
        {anchorRect && (
          <span
            aria-hidden
            style={{
              position: "fixed",
              left: anchorRect.left,
              top: anchorRect.top,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        )}
      </MiniPicker>
      {isBrowsing && (
        <EntityPickerModal
          title={t`Pick a metric or measure`}
          value={
            libraryMetricsCollection
              ? {
                  model: "collection",
                  id: libraryMetricsCollection.id as number,
                }
              : undefined
          }
          onChange={handleSelectResult}
          onClose={() => setIsBrowsing(false)}
          models={["metric", "measure", "table"]}
          isSelectableItem={(item) =>
            item.model === "metric" || item.model === "measure"
          }
          isDisabledItem={isTableWithoutMeasures}
          options={{
            hasConfirmButtons: false,
            hasDatabases: true,
            getItemTooltip: getTableWithoutMeasuresTooltip,
            disableSearchScope: true,
          }}
        />
      )}
    </>
  );
});

function isTableWithoutMeasures(item: OmniPickerItem) {
  return (
    item.model === "table" &&
    "measures" in item &&
    (item.measures?.length ?? 0) === 0
  );
}

function getTableWithoutMeasuresTooltip(item: OmniPickerItem) {
  if (isTableWithoutMeasures(item)) {
    return t`This table has no measures`;
  }
  return undefined;
}
