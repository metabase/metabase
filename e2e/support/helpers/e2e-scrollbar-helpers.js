export const isScrollableHorizontally = element => {
  const { clientHeight, offsetHeight } = element;
  const style = window.getComputedStyle(element);
  const borderTopWidth = parseInt(style.borderTopWidth, 10);
  const borderBottomWidth = parseInt(style.borderBottomWidth, 10);
  const borderWidth = borderTopWidth + borderBottomWidth;
  const horizontalScrollbarHeight = offsetHeight - clientHeight - borderWidth;
  const isHorizontalScrollbarVisible = horizontalScrollbarHeight > 0;

  return isHorizontalScrollbarVisible;
};

export const isScrollableVertically = element => {
  const { clientWidth, offsetWidth } = element;
  const style = window.getComputedStyle(element);
  const borderLeftWidth = parseInt(style.borderLeftWidth, 10);
  const borderRightWidth = parseInt(style.borderRightWidth, 10);
  const borderWidth = borderLeftWidth + borderRightWidth;
  const verticalScrollbarWidth = offsetWidth - clientWidth - borderWidth;
  const isVerticalScrollbarVisible = verticalScrollbarWidth > 0;

  return isVerticalScrollbarVisible;
};
