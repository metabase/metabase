import { SimpleGrid } from "metabase/ui";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import { AnalysisTypeCard } from "../components/AnalysisTypeCard";
import type { AnalysisKind } from "../spec/types";

type AnalysisGalleryProps = {
  isDisabled: boolean;
  isCompact?: boolean;
  onSelect: (kind: AnalysisKind) => void;
};

/** The kinds of analysis to pick from, illustrated. */
export const AnalysisGallery = ({
  isDisabled,
  isCompact = false,
  onSelect,
}: AnalysisGalleryProps) => (
  <SimpleGrid
    cols={isCompact ? 3 : { base: 1, sm: 2, md: 3 }}
    spacing={isCompact ? "sm" : "lg"}
  >
    {ANALYSIS_KINDS.map((kind) => (
      <AnalysisTypeCard
        key={kind}
        config={getAnalysisConfig(kind)}
        disabled={isDisabled}
        isCompact={isCompact}
        onSelect={() => onSelect(kind)}
      />
    ))}
  </SimpleGrid>
);
