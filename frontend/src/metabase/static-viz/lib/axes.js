import { formatNumber } from "./numbers";
import { measureText } from "./text";

export const getXTickHeight = (data, accessors) => {
  const tickWidth = data
    .map(accessors.x)
    .map(tick => String(tick))
    .map(tick => measureText(tick))
    .reduce((a, b) => Math.max(a, b), 0);

  return Math.ceil(Math.sqrt(Math.pow(tickWidth, 2) / 2));
};

export const getYTickWidth = (data, accessors, settings) => {
  return data
    .map(accessors.y)
    .map(tick => formatNumber(tick, settings?.y))
    .map(tick => measureText(tick))
    .reduce((a, b) => Math.max(a, b), 0);
};

export const getXTickLabelProps = (layout, isVertical) => ({
  fontSize: layout.font.size,
  fontFamily: layout.font.family,
  fill: layout.colors.textMedium,
  textAnchor: isVertical ? "start" : "middle",
});

export const getYTickLabelProps = layout => ({
  fontSize: layout.font.size,
  fontFamily: layout.font.family,
  fill: layout.colors.textMedium,
  textAnchor: "end",
});
