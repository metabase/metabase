export function hasSdkAttributionBadge(container: Element | null): boolean {
  if (!container) {
    return false;
  }

  // eslint-disable-next-line no-literal-metabase-strings -- attribution tests
  const logoElement = container.querySelector("svg[aria-label=Metabase]");

  if (!logoElement) {
    return false;
  }

  // Logo is in the viewport, but obscured by another element.
  // False Positives: logo is hidden behind a modal with a backdrop.
  const topmostElement = getTopmostElement(logoElement);
  if (topmostElement && !logoElement.contains(topmostElement)) {
    return false;
  }

  let parent = logoElement.parentElement;

  while (parent) {
    if (!isElementStyleVisible(getComputedStyle(parent))) {
      return false;
    }

    parent = parent.parentElement;
  }

  const style = window.getComputedStyle(logoElement);

  // eslint-disable-next-line no-console -- for debugging, to remove.
  console.log("[logo]", { logoElement });

  return (
    isElementStyleVisible(style) &&
    parseInt(style.width) > 10 &&
    parseInt(style.height) > 10
  );
}

const isElementStyleVisible = (style: CSSStyleDeclaration): boolean =>
  style.visibility === "visible" &&
  style.display !== "none" &&
  parseInt(style.opacity) === 1;

function getTopmostElement(element: Element): Element | null {
  const rect = element.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return document.elementFromPoint(centerX, centerY);
}
