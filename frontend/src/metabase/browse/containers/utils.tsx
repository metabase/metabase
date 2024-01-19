/** This function is in a separate file so it can be straightforwardly mocked in tests */
export const getPageWidth = (
  contentViewport: HTMLElement,
  gridGapSize: number,
) => {
  const browseContainer = contentViewport?.children?.[0].children?.[0];
  const width = (browseContainer?.clientWidth ?? 500) - gridGapSize;
  return width;
};
