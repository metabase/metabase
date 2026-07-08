import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type {
  AvailableDimension,
  MetricSourceId,
} from "metabase/metrics-viewer/types";
import type { DimensionPickerSection } from "metabase/metrics-viewer/utils";

export function useDimensionPickerSidebarSections(): DimensionPickerSection[] {
  const {
    sidebarAvailableDimensions: availableDimensions,
    sourceOrder,
    sourceDataById,
  } = useMetricsViewerContext();

  const sections: DimensionPickerSection[] = [];

  const splitByGroup = (
    dimensions: AvailableDimension[],
    sectionName?: string,
    options: {
      isShared?: boolean;
      sourceId?: MetricSourceId;
      preferGroupName?: boolean;
    } = {},
  ) => {
    const { preferGroupName, isShared, sourceId } = options;
    const groups = new Map<string | undefined, AvailableDimension[]>();
    for (const dimension of dimensions) {
      const groupId = dimension.group?.id;
      const existing = groups.get(groupId);
      if (existing) {
        existing.push(dimension);
      } else {
        groups.set(groupId, [dimension]);
      }
    }

    if (groups.size <= 1) {
      const groupName = dimensions[0]?.group?.displayName;
      sections.push({
        name: getDimensionPickerSectionName(
          sectionName,
          groupName,
          preferGroupName,
        ),
        isShared,
        sourceId,
        items: dimensions.map((dimension) => ({
          ...dimension,
          name: dimension.dimensionBreakoutInfo.label,
        })),
      });
      return;
    }

    const sortedGroups = [...groups.values()].sort(sortDimensionGroups);

    for (const groupDimensions of sortedGroups) {
      const groupName = groupDimensions[0].group?.displayName;
      sections.push({
        name: getDimensionPickerSectionName(
          sectionName,
          groupName,
          preferGroupName,
        ),
        isShared,
        sourceId,
        items: groupDimensions.map((dimension) => ({
          ...dimension,
          name: dimension.dimensionBreakoutInfo.label,
        })),
      });
    }
  };

  const hasMultipleSources = sourceOrder.length > 1;

  if (hasMultipleSources && availableDimensions.shared.length > 0) {
    splitByGroup(availableDimensions.shared, t`Shared`, {
      isShared: true,
      preferGroupName: true,
    });
  }

  for (const sourceId of sourceOrder) {
    const sourceDimensions = availableDimensions.bySource[sourceId];
    if (!sourceDimensions || sourceDimensions.length === 0) {
      continue;
    }

    if (hasMultipleSources) {
      const sourceName = sourceDataById[sourceId]?.name ?? sourceId;
      splitByGroup(sourceDimensions, sourceName, {
        sourceId,
        preferGroupName: true,
      });
    } else {
      splitByGroup(sourceDimensions);
    }
  }

  return sections;
}

function getDimensionPickerSectionName(
  sectionName: string | undefined,
  groupName: string | undefined,
  preferGroupName = false,
) {
  if (preferGroupName && groupName) {
    return groupName;
  }

  if (sectionName && groupName) {
    return `${sectionName} · ${groupName}`;
  }

  return sectionName ?? groupName;
}

function sortDimensionGroups(
  first: AvailableDimension[],
  second: AvailableDimension[],
) {
  return getDimensionGroupPriority(first) - getDimensionGroupPriority(second);
}

function getDimensionGroupPriority(dimensions: AvailableDimension[]) {
  return dimensions[0]?.group?.type === "main" ? 0 : 1;
}
