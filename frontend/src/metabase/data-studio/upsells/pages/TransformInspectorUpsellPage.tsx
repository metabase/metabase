import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function TransformInspectorUpsellPage() {
  usePageTitle(t`Transform inspector`);

  return (
    <BaseUpsellPage
      campaign="data-studio-transform-inspector"
      location="data-studio-transform-inspector-page"
      header={t`Transform inspector`}
      title={t`Inspect transform inputs and outputs at every step`}
      description={t`See what data flows through each stage of a transform, so you can debug issues and understand results without guesswork.`}
    />
  );
}
