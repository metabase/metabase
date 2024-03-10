// This is needed in because table headers don't actually have an onClick handler
// they instead have an onDragStop listener and check to see how many pixels
// the column has moved. if it's less than 5, we treat it like a click
export const tableHeaderClick = element => {
  element.trigger("mousedown").trigger("mouseup");
};
