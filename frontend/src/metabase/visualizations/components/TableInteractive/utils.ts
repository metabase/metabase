import {
  defaultRenderer,
  dateRenderer,
  emailRenderer,
  booleanRenderer,
  sourceRenderer,
  countryRenderer,
  badgeRenderer,
  renderHeader,
} from "./renderers";

export const getRowHeightForViewMode = (viewMode: string) => {
  switch (viewMode) {
    case "cozy":
      return 36;
    case "compact":
      return 24;
    default:
      return 28;
  }
};

function pickRenderer(col) {
  if (col.semantic_type) {
    return rendererForSemanticType(col);
  }
}

function rendererForSemanticType(col) {
  switch (col.semantic_type) {
    case "type/CreationTimestamp":
    case "type/DateTime":
      return dateRenderer;
    case "type/Email":
      return emailRenderer;
    case "type/Boolean":
      return booleanRenderer;
    case "type/Source":
      return sourceRenderer;
    case "type/Country":
      return countryRenderer;
    case "type/Product":
      return badgeRenderer;
    case "type/Subscription":
      return badgeRenderer;
    default:
      return defaultRenderer;
  }
}

export const prepareColumns = (columns: Array<any>) => {
  return [
    {
      key: "index",
      name: "",
      width: 40,
      frozen: true,
      resizable: false,
      renderCell: () => "",
    },
    ...columns.map((col: any) => {
      return {
        ...col,
        resizable: true,
        key: `${col.name}-${col.field}`,
        width: "max-content",
        name: col.display_name,
        frozen: false,
        renderCell: pickRenderer(col) || defaultRenderer,
        renderHeaderCell: renderHeader,
      };
    }),
  ];
};
