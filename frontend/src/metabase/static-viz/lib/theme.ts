import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/embedding-sdk/theme";
import { getVisualizationTheme } from "metabase/visualizations/shared/utils/theme";

export const DEFAULT_VISUALIZATION_THEME = getVisualizationTheme({
  theme: DEFAULT_METABASE_COMPONENT_THEME,
  isStaticViz: true,
});
