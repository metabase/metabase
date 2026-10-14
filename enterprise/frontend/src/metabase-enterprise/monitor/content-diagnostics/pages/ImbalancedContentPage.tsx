import type { ComponentProps, ComponentType } from "react";

import type { ContentDiagnosticsImbalancedFindingType } from "metabase-types/api";

import { ImbalancedContent } from "../components";
import { getImbalancedContentConfig } from "../config";

import { ContentDiagnosticsPage } from "./ContentDiagnosticsPage";

type ImbalancedContentPageProps = {
  mode: ContentDiagnosticsImbalancedFindingType;
};

type ContentProps = Omit<ComponentProps<typeof ImbalancedContent>, "mode">;
const contentByMode: Record<
  ContentDiagnosticsImbalancedFindingType,
  ComponentType<ContentProps>
> = {
  empty: (props) => <ImbalancedContent {...props} mode="empty" />,
  sparse: (props) => <ImbalancedContent {...props} mode="sparse" />,
  crowded: (props) => <ImbalancedContent {...props} mode="crowded" />,
};

function ImbalancedContentPage({ mode }: ImbalancedContentPageProps) {
  return (
    <ContentDiagnosticsPage
      config={getImbalancedContentConfig(mode)}
      component={contentByMode[mode]}
    />
  );
}

export function EmptyContentPage() {
  return <ImbalancedContentPage mode="empty" />;
}

export function SparseContentPage() {
  return <ImbalancedContentPage mode="sparse" />;
}

export function CrowdedContentPage() {
  return <ImbalancedContentPage mode="crowded" />;
}
