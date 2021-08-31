export function getLeftAxisTickStyles(layout) {
  return {
    fontSize: 11,
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    textAnchor: "end",
  };
}

export function getBottomAxisTickStyles(layout) {
  return {
    fontSize: 11,
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    textAnchor: "middle",
  };
}
