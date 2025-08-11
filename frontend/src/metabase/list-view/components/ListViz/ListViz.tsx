import { t } from "ttag";

import type { VisualizationProps } from "metabase/visualizations/types";

import { ListView } from "../ListView";

const vizDefinition = {
  identifier: "list",
  iconName: "list",
  getUiName: () => t`List`,

  canSavePng: false,
  disableSettingsConfig: true,
  noHeader: true,
  hidden: true,
  supportPreviewing: false,

  checkRenderable: () => {},
};

export function ListViz(_props: VisualizationProps) {
  return <ListView />;
}

Object.assign(ListViz, vizDefinition);
