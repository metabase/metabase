import type { MatcherFunction } from "@testing-library/dom";
import type { ByRoleMatcher } from "@testing-library/react";
import {
  act,
  screen,
  render as testingLibraryRender,
  waitFor,
} from "@testing-library/react";

import { ThemeProvider } from "metabase/ui";

export { act, screen, waitFor };

/**
 * A minimal render helper for tests under `metabase/query_builder` and
 * `metabase/querying`. This file intentionally stays store-free: keep Redux,
 * router, entities, reducers, and API helpers in `__support__/ui-with-store`.
 */

export function getIcon(name: string) {
  return screen.getByLabelText(`${name} icon`);
}

export function queryIcon(name: string, role: ByRoleMatcher = "img") {
  return screen.queryByRole(role, { name: `${name} icon` });
}

/**
 * Returns a matcher function to find text content that is broken up by
 * multiple elements.
 *
 * @example
 * screen.getByText(getBrokenUpTextMatcher("my text with a styled word"))
 */
export function getBrokenUpTextMatcher(textToFind: string): MatcherFunction {
  return (content, element) => {
    const hasText = (node: Element | null | undefined) =>
      node?.textContent === textToFind;
    const childrenDoNotHaveText = element
      ? Array.from(element.children).every((child) => !hasText(child))
      : true;

    return hasText(element) && childrenDoNotHaveText;
  };
}

/**
 * A replacement for `waitForElementToBeRemoved` that does not require the
 * element to exist before being removed, which plays better with our async
 * entity framework.
 */
export const waitForLoaderToBeRemoved = async () => {
  await waitFor(
    () => {
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    },
    { timeout: 3000 },
  );
};

/**
 * jsdom doesn't have getBoundingClientRect, so we need to mock it for any
 * components with virtualization to work in tests, like the entity picker.
 */
export const mockGetBoundingClientRect = (options: Partial<DOMRect> = {}) => {
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockImplementation(() => {
      return {
        height: 200,
        width: 200,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
        ...options,
      };
    });
};

/**
 * jsdom doesn't have DataTransfer
 */
export function createMockClipboardData(
  opts?: Partial<DataTransfer>,
): DataTransfer {
  const clipboardData = { ...opts };
  return clipboardData as unknown as DataTransfer;
}

/**
 * jsdom doesn't have MediaQueryList
 */
export const createMockMediaQueryList = (
  opts?: Partial<MediaQueryList>,
): MediaQueryList => ({
  media: "",
  matches: false,
  onchange: jest.fn(),
  dispatchEvent: jest.fn(),
  addListener: jest.fn(),
  addEventListener: jest.fn(),
  removeListener: jest.fn(),
  removeEventListener: jest.fn(),
  ...opts,
});

const ThemeWrapper = ({ children }: React.PropsWithChildren) => (
  <ThemeProvider resolvedColorScheme="light">{children}</ThemeProvider>
);

export function renderWithTheme(children: React.ReactElement) {
  return testingLibraryRender(children, { wrapper: ThemeWrapper });
}

// eslint-disable-next-line import/export -- intentionally overriding render from @testing-library/react
export { renderWithTheme as render };

// eslint-disable-next-line import/export -- intentionally overriding render from @testing-library/react
export * from "@testing-library/react";
