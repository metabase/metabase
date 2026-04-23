import { renderWithProviders } from "__support__/ui";
import { isTouchDevice } from "metabase/utils/browser";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { JoinColumnButton } from "./JoinColumnButton";

jest.mock("metabase/utils/browser", () => ({
  ...jest.requireActual("metabase/utils/browser"),
  isTouchDevice: jest.fn(() => false),
}));

const scrollIntoViewMock = jest.fn();

const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
    },
  ],
});

function setup({
  isOpened = false,
  isLhsPicker = true,
  isReadOnly = false,
  touch = false,
}: {
  isOpened?: boolean;
  isLhsPicker?: boolean;
  isReadOnly?: boolean;
  touch?: boolean;
} = {}) {
  (isTouchDevice as jest.Mock).mockReturnValue(touch);

  return renderWithProviders(
    <JoinColumnButton
      query={query}
      stageIndex={0}
      tableName={undefined}
      lhsExpression={undefined}
      rhsExpression={undefined}
      isLhsPicker={isLhsPicker}
      isOpened={isOpened}
      isReadOnly={isReadOnly}
      onClick={jest.fn()}
    />,
  );
}

describe("JoinColumnButton scroll on auto-open", () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("scrolls into view on auto-open on touch devices", () => {
    setup({ isOpened: true, touch: true });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  });

  it("does not scroll when mounted as closed then opened later", () => {
    const { rerender } = setup({ isOpened: false, touch: true });

    scrollIntoViewMock.mockClear();

    rerender(
      <JoinColumnButton
        query={query}
        stageIndex={0}
        tableName={undefined}
        lhsExpression={undefined}
        rhsExpression={undefined}
        isLhsPicker
        isOpened
        isReadOnly={false}
        onClick={jest.fn()}
      />,
    );

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("does not scroll on desktop", () => {
    setup({ isOpened: true, touch: false });

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
