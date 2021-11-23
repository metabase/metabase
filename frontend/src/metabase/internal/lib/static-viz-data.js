export const createSeries = ({
  name,
  type,
  color,
  yAxisPosition = "left",
  xType,
}) => {
  return {
    name,
    color,
    yAxisPosition,
    type: "line",
    data: [[1, 48], [2, 21], [3, 10], [4, 20], [5, 34], [6, 51], [7, 14]],
  };
};
