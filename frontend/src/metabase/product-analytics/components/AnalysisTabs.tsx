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

/** One tab per type of analysis, for a new analysis that hasn't picked one yet. */
export const AnalysisTabs = ({ kind, onChange }: AnalysisTabsProps) => (
  <Tabs
    value={kind}
    onChange={(value) => {
      if (isAnalysisKind(value)) {
        onChange(value);
      }
    }}
  >
    <Tabs.List>
      {ANALYSIS_KINDS.map((item) => (
        <Tabs.Tab key={item} value={item}>
          {getAnalysisConfig(item).name}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  </Tabs>
);
