import type { RowIndices } from "./types";

export const getRowIndices = (element: Element): RowIndices => {
  const indexRaw = element.getAttribute("data-dataset-index");
  const virtualIndexRaw = element.getAttribute("data-index");

  return {
    index: indexRaw ? parseInt(indexRaw, 10) : null,
    virtualIndex: virtualIndexRaw ? parseInt(virtualIndexRaw, 10) : null,
  };
};
