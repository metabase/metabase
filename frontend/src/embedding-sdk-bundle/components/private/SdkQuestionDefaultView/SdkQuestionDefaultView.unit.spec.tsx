import { screen } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";

import { useSdkQuestionContext } from "../SdkQuestion/context";

import type { SdkQuestionDefaultViewProps } from "./SdkQuestionDefaultView";
import { SdkQuestionDefaultView } from "./SdkQuestionDefaultView";

jest.mock("../SdkQuestion/context", () => ({
  ...jest.requireActual("../SdkQuestion/context"),
  useSdkQuestionContext: jest.fn(),
}));

// `jest.mock` above swapped the real hook for a mock, which the import is not
// typed as.
const mockUseSdkQuestionContext = useSdkQuestionContext as jest.MockedFunction<
  typeof useSdkQuestionContext
>;

// A viewport unit survives Mantine's size handling as-is, whereas pixel values
// are rewritten to a `calc(... * var(--mantine-scale))` expression.
const HEIGHT = "50vh";

type QuestionContext = Partial<ReturnType<typeof useSdkQuestionContext>>;

const LOADING_CONTEXT: QuestionContext = { isQuestionLoading: true };
const NOT_FOUND_CONTEXT: QuestionContext = {
  isQuestionLoading: false,
  question: undefined,
};

const setup = (
  props: SdkQuestionDefaultViewProps = {},
  context: QuestionContext = LOADING_CONTEXT,
) => {
  mockUseSdkQuestionContext.mockReturnValue(
    // Each of these states returns before the component reads the rest of the
    // context, so a partial one is all it ever gets to see.
    context as ReturnType<typeof useSdkQuestionContext>,
  );

  const { state } = setupSdkState();

  renderWithSDKProviders(<SdkQuestionDefaultView {...props} />, {
    componentProviderProps: { authConfig: createMockSdkConfig() },
    storeInitialState: state,
  });
};

describe("SdkQuestionDefaultView", () => {
  describe("loading state", () => {
    it("should render the loader inside a box that keeps the passed height", () => {
      setup({ height: HEIGHT });

      // The sizing box is a plain Box with no accessible role, so the height it
      // is meant to hold is the only thing to query it by.
      const sizedBox = screen
        .getByTestId("loading-indicator")
        .closest(`[style*="height: ${HEIGHT}"]`);

      expect(sizedBox).toBeInTheDocument();
    });

    it("should apply the passed className and style to the loading box", () => {
      setup({ className: "custom-class", style: { padding: "10px" } });

      const styledBox = screen
        .getByTestId("loading-indicator")
        .closest(".custom-class");

      expect(styledBox).toHaveStyle({ padding: "10px" });
    });
  });

  describe("error state", () => {
    it.each([
      { name: "question not found error", originalId: 42 },
      { name: "generic not found error", originalId: undefined },
    ])(
      "should render the $name inside a box that keeps the passed height",
      async ({ originalId }) => {
        setup({ height: HEIGHT }, { ...NOT_FOUND_CONTEXT, originalId });

        // The locale resolves asynchronously, and until it does the component
        // shows the loader rather than the error.
        const sizedBox = (
          await screen.findByTestId("sdk-error-container")
        ).closest(`[style*="height: ${HEIGHT}"]`);

        expect(sizedBox).toBeInTheDocument();
      },
    );
  });
});
