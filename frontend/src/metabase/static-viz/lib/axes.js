import { formatNumber } from "./numbers";
import { measureText } from "./text";

export const getXTickWidth = (data, accessors, maxWidth, fontSize) => {
  return getXTickWidthFromValues(data.map(accessors.x), maxWidth, fontSize);
};

export const getXTickWidthFromValues = (values, maxWidth, fontSize) => {
  const tickWidth = values
    .map(tick => String(tick))
    .map(tick => measureText(tick, fontSize))
    .reduce((a, b) => Math.max(a, b), 0);

  return Math.min(tickWidth, maxWidth);
};

export const getRotatedXTickHeight = tickWidth => {
  return Math.ceil(Math.sqrt(Math.pow(tickWidth, 2) / 2));
};

export const getYTickWidth = (data, accessors, settings, fontSize) => {
  return data
    .map(accessors.y)
    .map(tick => formatNumber(tick, settings?.y))
    .map(tick => measureText(tick, fontSize))
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

export const getLabelProps = layout => ({
  fontWeight: layout.labelFontWeight,
  fontSize: layout.font.size,
  fontFamily: layout.font.family,
  fill: layout.colors.textMedium,
  textAnchor: "middle",
});
