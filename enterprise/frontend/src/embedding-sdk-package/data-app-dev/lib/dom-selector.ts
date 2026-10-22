/** How many ancestors a selector may name before it is cut short. */
const MAX_SELECTOR_DEPTH = 12;

const MAX_LABEL_CLASSES = 2;

const isIdentifier = (value: string): boolean => /^[a-zA-Z][\w-]*$/.test(value);

const quoteAttribute = (value: string): string =>
  `"${value.replace(/["\\]/g, "\\$&")}"`;

/** The attributes worth naming a node by, most stable first. */
const stableAttributeSelector = (element: Element): string | null => {
  const testId = element.getAttribute("data-testid");

  if (testId) {
    return `[data-testid=${quoteAttribute(testId)}]`;
  }

  return element.id && isIdentifier(element.id) ? `#${element.id}` : null;
};

const tagName = (element: Element): string => element.tagName.toLowerCase();

const nthOfTypeSuffix = (element: Element): string => {
  const parent = element.parentElement;

  if (!parent) {
    return "";
  }

  const sameTag = Array.from(parent.children).filter(
    (sibling) => sibling.tagName === element.tagName,
  );

  return sameTag.length > 1
    ? `:nth-of-type(${sameTag.indexOf(element) + 1})`
    : "";
};

/**
 * A CSS selector for the element, as specific as it needs to be to find the
 * same node again after a rebuild.
 *
 * It stops early at a `data-testid` or an `id` — those survive edits to the
 * markup around them — and otherwise names each ancestor up to `root` by tag
 * and position. It is a best-effort anchor, not an identity: a selector that no
 * longer matches only costs the comment its marker in the preview, while the
 * source location and the component path still say what was commented on.
 */
export const buildElementSelector = (
  element: Element,
  root: Element | null,
): string => {
  const steps: string[] = [];
  let current: Element | null = element;

  while (current && steps.length < MAX_SELECTOR_DEPTH) {
    const stable = stableAttributeSelector(current);

    if (stable) {
      steps.unshift(stable);

      return steps.join(" > ");
    }

    steps.unshift(`${tagName(current)}${nthOfTypeSuffix(current)}`);

    if (current === root) {
      return steps.join(" > ");
    }

    current = current.parentElement;
  }

  return steps.join(" > ");
};

/** A short human name for the element, e.g. `button.primary`. */
export const describeElementLabel = (element: Element): string => {
  const testId = element.getAttribute("data-testid");

  if (testId) {
    return `${tagName(element)}[${testId}]`;
  }

  const classes = Array.from(element.classList)
    .filter(isIdentifier)
    .slice(0, MAX_LABEL_CLASSES);

  return [tagName(element), ...classes].join(".");
};
