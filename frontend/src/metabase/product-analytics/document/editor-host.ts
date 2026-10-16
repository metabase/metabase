import { useMemo } from "react";
import { t } from "ttag";

import type { DocumentEditorHost } from "metabase/documents/components/Editor/DocumentEditorHost";
import type { CommandSection } from "metabase/rich_text_editing/tiptap/extensions/Command/types";
import type { IconName } from "metabase-types/api";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import type { AnalysisKind } from "../spec/types";

import { useAnalysisDocument } from "./AnalysisDocumentContext";
import { AnalysisNode } from "./AnalysisNode";
import { AnalysisDocumentAttributes } from "./document-context";

const ANALYSIS_ICONS: Record<AnalysisKind, IconName> = {
  funnel: "funnel",
  paths: "sankey",
  habit: "calendar",
  lifecycle: "lineandbar",
  cohorts: "grid",
};

const useAnalysisCommandSections = (): CommandSection[] => {
  const { insertAnalysis } = useAnalysisDocument();
  return useMemo(
    () => [
      {
        title: t`Analyses`,
        items: ANALYSIS_KINDS.map((kind) => ({
          icon: ANALYSIS_ICONS[kind],
          label: getAnalysisConfig(kind).name,
          command: `productAnalysis.${kind}`,
          isAllowedAtPosition: (editor) => !editor.isActive("supportingText"),
          run: () => insertAnalysis(kind),
        })),
      },
    ],
    [insertAnalysis],
  );
};

export const ANALYSIS_DOCUMENT_EXTENSIONS = [
  AnalysisDocumentAttributes,
  AnalysisNode,
];

export const analysisDocumentEditorHost: Partial<DocumentEditorHost> = {
  capabilities: {
    canEmbedCharts: true,
    canUseMetabot: false,
    canOpenCardInQueryBuilder: true,
  },
  useExtraCommandSections: useAnalysisCommandSections,
};
