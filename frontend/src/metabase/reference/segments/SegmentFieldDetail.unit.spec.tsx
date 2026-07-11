import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";

import SegmentFieldDetail from "./SegmentFieldDetail";

// Regression test for metabase#55322: opening the segment field detail page in
// edit mode crashed the app because `reinitializeForm` was wired to the *result*
// of calling formik's `handleReset()` during render (a state update during
// render → infinite re-render loop) instead of being passed a function.
function setup() {
  const storeInitialState = createMockState({
    // The `reference` reducer is registered in makeMainReducers; preload it so
    // the component renders its edit header (the seam that holds the bug).
    reference: {
      isEditing: true,
      isLoading: true,
      error: null,
      isFormulaExpanded: false,
    },
  } as any);

  return renderWithProviders(
    <SegmentFieldDetail
      // @ts-expect-error -- connected component prop passthrough
      params={{ fieldId: "1", segmentId: "1" }}
      style={{}}
    />,
    { storeInitialState },
  );
}

describe("SegmentFieldDetail (metabase#55322)", () => {
  it("renders the edit header without crashing while editing", () => {
    expect(() => setup()).not.toThrow();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});
