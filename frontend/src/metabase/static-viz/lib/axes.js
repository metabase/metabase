import { formatNumber } from "./numbers";
import { measureText } from "./text";

export const getYAxisWidth = (data, accessors, settings) => {
  return data
    .map(accessors.y)
    .map(tick => formatNumber(tick, settings?.y))
    .map(tick => measureText(tick))
    .reduce((a, b) => Math.max(a, b), 0);
};

export const getXTickLabelProps = layout => ({
  fontSize: layout.font.size,
  fontFamily: layout.font.family,
  fill: layout.colors.textMedium,
  textAnchor: "middle",
});

export const getYTickLabelProps = layout => ({
  fontSize: layout.font.size,
  fontFamily: layout.font.family,
  fill: layout.colors.textMedium,
  textAnchor: "end",
});
