import { useState } from "react";
import { t } from "ttag";

import { Alert } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../../analyses/config";
import type { AnalysisKind } from "../../spec/types";

import { DrillMenu, DrillMenuLoader } from "./DrillMenu";

const KIND_ICONS: Record<AnalysisKind, IconName> = {
  funnel: "funnel",
  paths: "sankey",
  habit: "history",
  lifecycle: "refresh",
  cohorts: "grid",
};

type NewAnalysisPopoverProps = {
  /** Resolves once the new analysis is open. */
  onSelect: (kind: AnalysisKind) => Promise<void>;
  onClose: () => void;
};

/** The second state of the click actions popover: which analysis to start. */
export const NewAnalysisPopover = ({
  onSelect,
  onClose,
}: NewAnalysisPopoverProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (kind: AnalysisKind) => {
    setIsLoading(true);
    setError(null);
    try {
      await onSelect(kind);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  };

  return (
    <DrillMenu
      title={t`What kind of analysis?`}
      status={
        isLoading ? (
          <DrillMenuLoader label={t`Finding who's in this group…`} />
        ) : error !== null ? (
          <Alert color="error">{error}</Alert>
        ) : undefined
      }
      items={ANALYSIS_KINDS.map((kind) => ({
        key: kind,
        title: getAnalysisConfig(kind).name,
        icon: KIND_ICONS[kind],
        onClick: () => handleSelect(kind),
      }))}
    />
  );
};
