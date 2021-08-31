export function leftAxisTickStyles(layout) {
  return {
    fontSize: 11,
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    textAnchor: "end",
  };
}

export function bottomAxisTickStyles(layout) {
  return {
    fontSize: 11,
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    textAnchor: "middle",
  };
}
