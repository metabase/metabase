// Every function here runs in the story page through page.evaluate or page.addInitScript,
// so each one must be self-contained: no references to imports or other module-level values.

type LokiReadyStateManager = {
  registerPendingPromise: (promise: Promise<unknown>) => void;
  awaitReady: () => Promise<boolean>;
};

type LokiWindow = Window & { loki?: LokiReadyStateManager };

type StorybookWindow = Window & {
  __STORYBOOK_PREVIEW__?: {
    currentRender?: {
      id?: string;
      phase?: string;
      story?: { parameters?: { loki?: { chromeSelector?: unknown } } };
    };
  };
};

export type StoryRenderResult =
  | { status: "rendered"; chromeSelector: string | undefined }
  | { status: "errored"; message: string };

export type ContentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Stories call @loki/create-async-callback, which registers a promise on window.loki
// that has to settle before the story is ready for a screenshot.
export function installLokiShim() {
  const pendingPromises: Promise<unknown>[] = [];

  const awaitReady = (): Promise<boolean> =>
    Promise.all(pendingPromises.splice(0)).then(() =>
      pendingPromises.length > 0 ? awaitReady() : true,
    );

  const lokiWindow: LokiWindow = window;
  lokiWindow.loki = {
    registerPendingPromise: (promise) => {
      pendingPromises.push(promise);
    },
    awaitReady,
  };
}

// Transitions and animations are off for the whole page lifetime,
// so an overlay opened by a play function is fully shown by the time the story finishes.
export function disableAnimations() {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = `
      *, :before, :after {
        transition: none !important;
        animation: none !important;
        will-change: auto !important;
      }
    `;
    document.documentElement.appendChild(style);
  });
}

export function awaitLokiReady() {
  const lokiWindow: LokiWindow = window;
  return lokiWindow.loki?.awaitReady();
}

// Storybook sets the "finished" phase after the play function and afterEach hooks have run.
export function getStoryRenderResult(
  storyId: string,
): StoryRenderResult | null {
  const errorMessage = document.querySelector(
    ".sb-show-errordisplay #error-message",
  );
  if (errorMessage instanceof HTMLElement) {
    return { status: "errored", message: errorMessage.innerText };
  }

  const storybookWindow: StorybookWindow = window;
  const render = storybookWindow.__STORYBOOK_PREVIEW__?.currentRender;
  if (render?.id !== storyId || render.phase !== "finished") {
    return null;
  }

  const chromeSelector = render.story?.parameters?.loki?.chromeSelector;
  return {
    status: "rendered",
    chromeSelector:
      typeof chromeSelector === "string" ? chromeSelector : undefined,
  };
}

// The union of the bounding boxes of every visible element under the parent of the selector's matches.
export function getContentBox(selector: string): ContentBox {
  type WalkContext = {
    isRoot: boolean;
    root: Element;
    overflowAncestor: Element | null;
    fixedAncestor: Element | null;
    parentHidden: boolean;
  };

  const OVERFLOW_VALUES = ["auto", "hidden", "scroll"];

  const hasOverflow = (element: Element) => {
    const style = window.getComputedStyle(element);
    return (
      OVERFLOW_VALUES.includes(style.overflowY) ||
      OVERFLOW_VALUES.includes(style.overflowX) ||
      OVERFLOW_VALUES.includes(style.overflow)
    );
  };

  const hasFixedPosition = (element: Element) =>
    window.getComputedStyle(element).position === "fixed";

  const isOutOfBounds = (element: Element, container: Element) => {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return (
      elementRect.top < containerRect.top ||
      elementRect.bottom > containerRect.bottom ||
      elementRect.left < containerRect.left ||
      elementRect.right > containerRect.right
    );
  };

  const isHiddenByOverflow = (
    element: Element,
    { overflowAncestor, fixedAncestor, parentHidden }: WalkContext,
  ) => {
    if (hasFixedPosition(element)) {
      return false;
    }
    if (parentHidden) {
      return true;
    }
    if (overflowAncestor && fixedAncestor === overflowAncestor) {
      return isOutOfBounds(element, overflowAncestor);
    }
    if (
      overflowAncestor &&
      fixedAncestor &&
      overflowAncestor.contains(fixedAncestor)
    ) {
      return false;
    }
    if (overflowAncestor) {
      return isOutOfBounds(element, overflowAncestor);
    }
    return false;
  };

  const isVisible = (element: Element) => {
    const style = window.getComputedStyle(element);
    return !(
      style.visibility === "hidden" ||
      style.display === "none" ||
      style.opacity === "0" ||
      ((style.width === "0px" || style.height === "0px") &&
        style.padding === "0px")
    );
  };

  const visibleElements: Element[] = [];

  const walk = (element: Element, context: WalkContext) => {
    const { root, isRoot } = context;
    const hiddenByOverflow =
      element.parentElement === root && hasOverflow(root)
        ? false
        : isHiddenByOverflow(element, context);

    if (isVisible(element) && !isRoot && !hiddenByOverflow) {
      visibleElements.push(element);
    }

    for (const child of Array.from(element.children)) {
      walk(child, {
        root,
        isRoot: false,
        parentHidden: hiddenByOverflow,
        fixedAncestor: hasFixedPosition(element)
          ? element
          : context.fixedAncestor,
        overflowAncestor: hasOverflow(element)
          ? element
          : context.overflowAncestor,
      });
    }
  };

  // With several matches, the deepest parent wins.
  const root = Array.from(
    document.querySelectorAll(selector),
    (element) => element.parentElement,
  ).reduce<Element | null>((deepest, parent) => {
    if (!deepest) {
      return parent;
    }
    return parent && deepest !== parent && deepest.contains(parent)
      ? parent
      : deepest;
  }, null);

  if (!root) {
    throw new Error(`No elements match "${selector}"`);
  }

  walk(root, {
    root,
    isRoot: true,
    overflowAncestor: null,
    fixedAncestor: null,
    parentHidden: false,
  });

  const [first, ...rest] = visibleElements.map((element) =>
    element.getBoundingClientRect(),
  );
  if (!first) {
    throw new Error(`No visible elements under "${selector}"`);
  }

  return rest.reduce<ContentBox>(
    (box, rect) => {
      const left = Math.min(box.x, rect.x);
      const top = Math.min(box.y, rect.y);
      return {
        x: left,
        y: top,
        width: Math.max(box.x + box.width, rect.x + rect.width) - left,
        height: Math.max(box.y + box.height, rect.y + rect.height) - top,
      };
    },
    { x: first.x, y: first.y, width: first.width, height: first.height },
  );
}
