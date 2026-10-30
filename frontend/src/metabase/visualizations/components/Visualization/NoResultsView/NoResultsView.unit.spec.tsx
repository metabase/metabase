import userEvent from "@testing-library/user-event";

import { setupTranslateContentStringSpy } from "__support__/content-translation";
import {
  createMockDOMRect,
  mockTextOverflow,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { setupForContentTranslationTest } from "metabase/content-translation/test-utils";

import NoResultsView from "./NoResultsView";

type SetupOpts = {
  isSmall?: boolean;
  message?: string;
};

const setup = ({ isSmall, message }: SetupOpts = {}) =>
  renderWithProviders(<NoResultsView isSmall={isSmall} message={message} />);

const MESSAGE =
  "Regions with fewer than 10 orders are hidden. See [the policy](https://example.com/policy).";

describe("NoResultsView", () => {
  it("should render the default copy without a message", () => {
    setup();

    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByTestId("no-results-image")).toBeInTheDocument();
  });

  it("should replace the default copy and illustration with the message", () => {
    setup({ message: MESSAGE });

    expect(screen.getByText(/Regions with fewer than 10/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "the policy" })).toHaveAttribute(
      "href",
      "https://example.com/policy",
    );
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("no-results-image")).not.toBeInTheDocument();
  });

  it("should keep the message visible in a small card", () => {
    setup({ message: MESSAGE, isSmall: true });

    expect(screen.getByText(/Regions with fewer than 10/)).toBeVisible();
  });

  it.each([
    ["regular", false],
    ["small", true],
  ])(
    "should not fade or show a tooltip when the message fits a %s card",
    async (_label, isSmall) => {
      setup({ message: MESSAGE, isSmall });

      const message = screen.getByText(/Regions with fewer than 10/);
      await userEvent.hover(message);

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      expect(screen.getByTestId("no-results-message")).not.toHaveAttribute(
        "data-clipped",
      );
    },
  );

  describe("when the text is a fraction of a pixel taller than its box", () => {
    beforeEach(() => {
      jest
        .spyOn(window.Element.prototype, "getBoundingClientRect")
        .mockReturnValue(createMockDOMRect({ width: 200, height: 197 }));
      jest
        .spyOn(window.Range.prototype, "getBoundingClientRect")
        .mockReturnValue(createMockDOMRect({ width: 200, height: 197.03 }));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should not treat the message as clipped", async () => {
      setup({ message: MESSAGE });

      expect(screen.getByTestId("no-results-message")).not.toHaveAttribute(
        "data-clipped",
      );

      await userEvent.hover(screen.getByText(/Regions with fewer than 10/));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  describe("when the message is clipped", () => {
    beforeEach(() => {
      mockTextOverflow();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each([
      ["regular", false],
      ["small", true],
    ])(
      "should fade it and show it in full on hover in a %s card",
      async (_label, isSmall) => {
        setup({ message: MESSAGE, isSmall });

        expect(screen.getByTestId("no-results-message")).toHaveAttribute(
          "data-clipped",
        );

        await userEvent.hover(screen.getByText(/Regions with fewer than 10/));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          /Regions with fewer than 10 orders are hidden/,
        );
      },
    );
  });

  describe("EE with content translation", () => {
    const getTranslateContentString = setupTranslateContentStringSpy();

    it("should translate the message", async () => {
      setupForContentTranslationTest({
        enterprisePlugins: ["content_translation"],
        tokenFeatures: { content_translation: true },
        staticallyEmbedded: true,
        dictionary: [
          {
            msgid: "Nothing this week",
            msgstr: "Rien cette semaine",
            locale: "en",
          },
        ],
        component: <NoResultsView message="Nothing this week" />,
      });

      expect(await screen.findByText("Rien cette semaine")).toBeInTheDocument();
      expect(getTranslateContentString()).toHaveBeenCalled();
    });
  });
});
