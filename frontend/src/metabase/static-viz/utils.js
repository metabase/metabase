export function leftAxisTickStyles(layout) {
  return {
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    fontSize: 11,
    textAnchor: "end",
  };
}

export function bottomAxisTickStyles(layout) {
  return {
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    fontSize: 11,
    textAnchor: "middle",
  };
}
