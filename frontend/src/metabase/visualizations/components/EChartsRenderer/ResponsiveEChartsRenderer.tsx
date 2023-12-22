import ExplicitSize from "metabase/components/ExplicitSize";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";

export const ResponsiveEChartsRenderer = ExplicitSize({
  wrapped: true,
  refreshMode: "debounceLeading",
  selector: false,
})((props: EChartsRendererProps) => {
  return (
    <ResponsiveEChartsRendererStyled>
      <EChartsRenderer {...props} />
    </ResponsiveEChartsRendererStyled>
  );
});
