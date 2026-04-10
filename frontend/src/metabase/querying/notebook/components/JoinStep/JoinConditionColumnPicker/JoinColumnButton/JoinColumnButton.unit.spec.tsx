import { renderWithProviders } from "__support__/ui";
import { isTouchDevice } from "metabase/utils/browser";

import { JoinColumnButton } from "./JoinColumnButton";

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
  function setupTouch() {
    (isTouchDevice as jest.Mock).mockReturnValue(true);
  }

  function setupDesktop() {
    (isTouchDevice as jest.Mock).mockReturnValue(false);
  }

  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("scrolls into view on auto-open on touch devices", async () => {
    setupTouch();

    renderWithProviders(<JoinColumnButton {...defaultProps} isOpened={true} />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  });

  it("does not scroll when mounted as closed then opened later", () => {
    setupTouch();

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
