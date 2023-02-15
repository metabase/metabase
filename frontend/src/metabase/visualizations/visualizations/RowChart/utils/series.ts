export const getChartSeries = (
  rawSeries: any[],
  placeholderSeries: any[],
  isPlaceholder: boolean,
) => {
  return isPlaceholder ? placeholderSeries : rawSeries;
};
