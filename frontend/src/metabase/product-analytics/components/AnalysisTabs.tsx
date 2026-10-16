import { Tabs } from "metabase/ui";

import {
  ANALYSIS_KINDS,
  getAnalysisConfig,
  isAnalysisKind,
} from "../analyses/config";
import type { AnalysisKind } from "../spec/types";

type AnalysisTabsProps = {
  kind: AnalysisKind;
  onChange: (kind: AnalysisKind) => void;
};

/**
 * One tab per type of analysis, for a new analysis that hasn't picked one
 * yet. Spans the page; the labels line up with the title below.
 */
export const AnalysisTabs = ({ kind, onChange }: AnalysisTabsProps) => (
  <Tabs
    bg="background-primary"
    value={kind}
    onChange={(value) => {
      if (isAnalysisKind(value)) {
        onChange(value);
      }
    }}
  >
    <Tabs.List pl="xxl" pr="lg">
      {ANALYSIS_KINDS.map((item) => (
        <Tabs.Tab key={item} value={item}>
          {getAnalysisConfig(item).name}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  </Tabs>
);
