/**
 * Using `.filter(":visible")` or `.should("be.visible")` fails here as Cypress
 * is not able to reliably detect a fixed-position element as visible.
 *
 * WARNING: It does not assert the element's stacking order for obscured elements though,
 * so you will need to assert that separately.
 */
export function isFixedPositionElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  if (parseFloat(style.opacity) === 0) {
    return false;
  }

  // Check if element has a non-zero size
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Check if element is positioned completely outside viewport
  if (
    style.position === "fixed" &&
    (rect.right < 0 ||
      rect.bottom < 0 ||
      rect.left > viewportWidth ||
      rect.top > viewportHeight)
  ) {
    return false;
  }

  // Check if any parent elements hides this element
  let parent = element.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);

    if (
      parentStyle.display === "none" ||
      parentStyle.visibility === "hidden" ||
      parseFloat(parentStyle.opacity) === 0
    ) {
      return false;
    }

    parent = parent.parentElement;
  }

  return true;
}

/**
 * Asserts that an element never exists from when this assertion was called
 * up until the timeout expires, checked at every polling interval.
 *
 * @param shouldNotExistSelector - selector of the element that should not exist
 * @param successSelector - selector of the element that when present, marks the assertion as successful
 * @param rejectionMessage - message to reject with if the element exists
 * @param pollInterval - how often to check for the element
 * @param timeout - how long to wait before failing the test
 */
export function assertElementNeverExists({
  shouldNotExistSelector,
  successSelector,
  rejectionMessage,
  pollInterval,
  timeout,
}: {
  shouldNotExistSelector: string;
  successSelector: string;
  rejectionMessage: string;
  pollInterval: number;
  timeout: number;
}) {
  cy.window().then((win) => {
    return new Cypress.Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const shouldNotExistElement = win.document.querySelector(
          shouldNotExistSelector,
        );
        const successElement = win.document.querySelector(successSelector);

        if (shouldNotExistElement) {
          clearInterval(checkInterval);
          reject(new Error(rejectionMessage));
        } else if (successElement) {
          clearInterval(checkInterval);
          resolve();
        }
      }, pollInterval);

      setTimeout(() => {
        const timeoutMessage = `timeout exceeded after ${timeout}ms. expect "${successSelector}" to eventually exist.`;

        clearInterval(checkInterval);
        reject(new Error(timeoutMessage));
      }, timeout);
    });
  });
}
