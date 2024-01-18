export const getPageWidth = (
  contentViewport: HTMLElement,
  gridGapSize: number,
) => {
  const browseAppRoot = contentViewport?.children?.[0];
  const width = browseAppRoot?.clientWidth - gridGapSize;
  return width;
};
