import { useMemo, useState } from "react";
import { match } from "ts-pattern";

import { Box, Divider, Flex, Paper } from "metabase/ui";
import type { DimensionId } from "metabase-types/api";

import { AddDimensionsPanelView } from "./AddDimensionsPanel";
import { DimensionList } from "./DimensionList";
import { DimensionSettingsPanelView } from "./DimensionSettingsPanel";
import S from "./MetricDimensions.module.css";
import {
  type DimensionCandidate,
  type DimensionsDraft,
  addToDraft,
  getAddableGroups,
  getDraftDimensions,
  removeFromDraft,
  reorderDraft,
  setDraftDefault,
  updateInDraft,
} from "./draft";

type DetailMode =
  | { type: "idle" }
  | { type: "add" }
  | { type: "edit"; dimensionId: DimensionId };

interface DraftMetricDimensionsProps {
  candidates: DimensionCandidate[];
  draft: DimensionsDraft;
  onChange: (draft: DimensionsDraft) => void;
}

/**
 * PROTOTYPE: the Dimensions editor for a metric that isn't saved yet. Looks
 * and behaves like the saved metric's editor, but every change stays in the
 * draft until the metric is created.
 */
export function DraftMetricDimensions({
  candidates,
  draft,
  onChange,
}: DraftMetricDimensionsProps) {
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<DimensionId>>(new Set());
  const [mode, setMode] = useState<DetailMode>({ type: "idle" });

  const candidateByKey = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [candidate.dimension.id, candidate]),
      ),
    [candidates],
  );
  const allDimensions = useMemo(
    () => getDraftDimensions(candidates, draft),
    [candidates, draft],
  );
  const trimmedSearch = search.trim().toLowerCase();
  const dimensions = useMemo(
    () =>
      trimmedSearch === ""
        ? allDimensions
        : allDimensions.filter((dimension) =>
            dimension.display_name.toLowerCase().includes(trimmedSearch),
          ),
    [allDimensions, trimmedSearch],
  );
  const addableGroups = useMemo(
    () => getAddableGroups(candidates, draft, addSearch),
    [candidates, draft, addSearch],
  );

  const handleToggle = (id: DimensionId, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleRemove = () => {
    const ids = Array.from(checkedIds);
    onChange(removeFromDraft(draft, ids));
    setCheckedIds(new Set());
    setMode((current) =>
      current.type === "edit" && ids.includes(current.dimensionId)
        ? { type: "idle" }
        : current,
    );
  };

  const activeId = mode.type === "edit" ? mode.dimensionId : null;

  return (
    <Paper
      withBorder
      shadow="none"
      className={S.root}
      data-testid="metric-dimensions"
    >
      <Flex className={S.columns}>
        <DimensionList
          dimensions={dimensions}
          isLoading={false}
          error={null}
          search={search}
          isSearchActive={trimmedSearch !== ""}
          checkedIds={checkedIds}
          activeId={activeId}
          isAddDisabled={mode.type === "add" || checkedIds.size > 0}
          onSearchChange={setSearch}
          onToggle={handleToggle}
          onAdd={() => setMode({ type: "add" })}
          onRemove={handleRemove}
          onEdit={(dimensionId) => setMode({ type: "edit", dimensionId })}
          onReorder={(ids) => onChange(reorderDraft(draft, ids))}
        />

        <Divider orientation="vertical" />

        {match(mode)
          .with({ type: "idle" }, () => <Box className={S.column} />)
          .with({ type: "add" }, () => (
            <AddDimensionsPanelView
              groups={addableGroups}
              isLoading={false}
              error={null}
              search={addSearch}
              isSearchActive={addSearch.trim() !== ""}
              onSearchChange={setAddSearch}
              onAdd={(_group, dimension) => {
                const candidate = candidateByKey.get(dimension.id);
                if (candidate) {
                  onChange(addToDraft(draft, candidate));
                }
              }}
              onDone={() => setMode({ type: "idle" })}
            />
          ))
          .with({ type: "edit" }, ({ dimensionId }) => {
            const dimension = allDimensions.find(
              (item) => item.id === dimensionId,
            );
            const candidate = candidateByKey.get(dimensionId);
            return dimension && candidate ? (
              <DimensionSettingsPanelView
                key={dimension.id}
                dimension={dimension}
                isDefaultLoading={false}
                sourceColumnLabel={candidate.sourceColumnLabel}
                temporalUnits={candidate.temporalUnits}
                onUpdate={async (changes) => {
                  onChange(updateInDraft(draft, dimension.id, changes));
                  return true;
                }}
                onSetDefault={() =>
                  onChange(setDraftDefault(draft, dimension.id))
                }
                onRemoveDefault={() => onChange(setDraftDefault(draft, null))}
              />
            ) : (
              <Box className={S.column} />
            );
          })
          .exhaustive()}
      </Flex>
    </Paper>
  );
}
