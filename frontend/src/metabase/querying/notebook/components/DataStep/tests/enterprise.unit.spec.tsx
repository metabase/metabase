import userEvent from "@testing-library/user-event";

import { fireEvent, screen } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";

import { type SetupOpts, setup as baseSetup } from "./setup";

async function setup(opts: SetupOpts = {}) {
  return baseSetup({
    enterprisePlugins: ["embedding"],
    ...opts,
  });
}

describe("DataStep", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;

  mockGetBoundingClientRect();

  beforeAll(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    // position fields are zeroed so floating-ui (Mantine popovers) does not
    // compute a `NaN` offset from the otherwise-undefined `top`/`left`.
    HTMLElement.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
      height: 1,
      width: 1,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
    });
  });

  afterAll(() => {
    HTMLElement.prototype.scrollBy = scrollBy;

    jest.resetAllMocks();
  });

  describe("link to data source", () => {
    describe("embedding SDK context", () => {
      beforeEach(async () => {
        await mockIsEmbeddingSdk();
      });

      it("should not show the tooltip", async () => {
        await setup({ isEmbeddingSdk: true });

        await userEvent.hover(await screen.findByText("Orders"));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });

      it.each([{ metaKey: true }, { ctrlKey: true }])(
        "meta/ctrl click should not open the data source",
        async (clickConfig) => {
          const { mockWindowOpen } = await setup({
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
        const { mockWindowOpen } = await setup({
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
