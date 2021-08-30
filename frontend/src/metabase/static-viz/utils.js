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
    fontFamily: "Lato, sans-serif",
    fill: layout.colors.axis.label.fill,
    fontSize: 11,
    textAnchor: "middle",
  };
}
