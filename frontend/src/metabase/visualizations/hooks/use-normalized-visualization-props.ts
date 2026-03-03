import type { VisualizationProps } from "metabase/visualizations/types";

export type NormalizableVisualizationProps = Omit<
  VisualizationProps,
  "width" | "height"
> & {
  width?: number | null;
  height?: number | null;
};

export function useNormalizedVisualizationProps(
  props: NormalizableVisualizationProps,
): VisualizationProps {
  return {
    ...props,
    width: props.width ?? 0,
    height: props.height ?? 0,
  };
}
