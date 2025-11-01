const getInnerWidth = (element: HTMLElement) => {
  if (!element) {
    return 0;
  }

  const styles = window.getComputedStyle(element);
  return (
    element.clientWidth -
    parseFloat(styles.paddingLeft) -
    parseFloat(styles.paddingRight)
  );
};

export const getIframeDimensions = (element: HTMLElement | null) => {
  if (!element) {
    return { width: 0, height: 0 };
  }

  const width = getInnerWidth(element);
  return { width, height: Math.round(innerWidth / 1.5) };
};
