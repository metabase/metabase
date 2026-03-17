export const getRowIndex = (element: Element): number | null => {
  const indexRaw = element.getAttribute("data-dataset-index");
  if (!indexRaw) {
    return null;
  }
  return parseInt(indexRaw, 10);
};
