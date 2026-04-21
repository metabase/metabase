import userEvent from "@testing-library/user-event";

import { fireEvent, screen } from "__support__/ui";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({
    enterprisePlugins: ["embedding"],
    ...opts,
  });
}

describe("DataStep", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    HTMLElement.prototype.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ height: 1, width: 1 });
  });

  afterAll(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;

    jest.resetAllMocks();
  });

  describe("link to data source", () => {
    describe("embedding SDK context", () => {
      beforeEach(async () => {
        await mockIsEmbeddingSdk();
      });

      it("should not show the tooltip", async () => {
        setup({ isEmbeddingSdk: true });

        await userEvent.hover(await screen.findByText("Orders"));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });

      it.each([{ metaKey: true }, { ctrlKey: true }])(
        "meta/ctrl click should not open the data source",
        async (clickConfig) => {
          const { mockWindowOpen } = setup({
            isEmbeddingSdk: true,
          });

          const dataSource = await screen.findByText("Orders");
          fireEvent.click(dataSource, clickConfig);

          expect(await screen.findByText("Orders")).toBeInTheDocument();
          expect(mockWindowOpen).not.toHaveBeenCalled();
          mockWindowOpen.mockClear();
        },
      );

      it("middle click should not open the data source", async () => {
        const { mockWindowOpen } = setup({
          isEmbeddingSdk: true,
        });

        const dataSource = await screen.findByText("Orders");
        const middleClick = new MouseEvent("auxclick", {
          bubbles: true,
          button: 1,
        });
        fireEvent(dataSource, middleClick);

        expect(mockWindowOpen).not.toHaveBeenCalled();
        mockWindowOpen.mockClear();
      });
    });
  });
});
