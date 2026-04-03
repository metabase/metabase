import { renderWithProviders } from "__support__/ui";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isTouchDevice } from "metabase/lib/browser";

import { JoinColumnButton } from "./JoinColumnButton";

jest.mock("metabase/embedding-sdk/config", () => ({
  ...jest.requireActual("metabase/embedding-sdk/config"),
  isEmbeddingSdk: jest.fn(() => false),
}));

jest.mock("metabase/lib/browser", () => ({
  ...jest.requireActual("metabase/lib/browser"),
  isTouchDevice: jest.fn(() => false),
}));

const scrollIntoViewMock = jest.fn();

const defaultProps = {
  query: {} as any,
  stageIndex: 0,
  tableName: undefined,
  lhsExpression: undefined,
  rhsExpression: undefined,
  isLhsPicker: true,
  isOpened: false,
  isReadOnly: false,
  onClick: jest.fn(),
};

describe("JoinColumnButton scroll on auto-open", () => {
  function setupMobileSDK() {
    (isTouchDevice as jest.Mock).mockReturnValue(true);
    (isEmbeddingSdk as jest.Mock).mockReturnValue(true);
  }

  function setupDesktop() {
    (isTouchDevice as jest.Mock).mockReturnValue(false);
    (isEmbeddingSdk as jest.Mock).mockReturnValue(false);
  }

  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("scrolls into view on auto-open in mobile SDK", async () => {
    setupMobileSDK();

    renderWithProviders(<JoinColumnButton {...defaultProps} isOpened={true} />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  });

  it("does not scroll on user-initiated open in mobile SDK", () => {
    setupMobileSDK();

    const { rerender } = renderWithProviders(
      <JoinColumnButton {...defaultProps} isOpened={false} />,
    );

    scrollIntoViewMock.mockClear();

    rerender(<JoinColumnButton {...defaultProps} isOpened={true} />);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("does not scroll on desktop", () => {
    setupDesktop();

    renderWithProviders(<JoinColumnButton {...defaultProps} isOpened={true} />);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
