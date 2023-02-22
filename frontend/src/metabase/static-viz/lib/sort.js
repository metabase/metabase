export const sortTimeSeries = series =>
  series
    .slice()
    .sort((a, b) => new Date(a[0]).valueOf() - new Date(b[0]).valueOf());
