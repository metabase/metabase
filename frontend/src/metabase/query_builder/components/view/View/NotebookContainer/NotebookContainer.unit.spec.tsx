import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import Question from "metabase-lib/v1/Question";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import { NotebookContainer } from "./NotebookContainer";

// Isolate the container's gating logic from the heavy Notebook editor and the
// native-preview panel's data fetching. Each mock renders a marker so the test
// can assert only on *which* branches the container decides to render.
jest.mock("metabase/querying/notebook/components/Notebook", () => ({
  Notebook: () => <div data-testid="notebook" />,
}));

jest.mock("./NotebookNativePreview", () => ({
  NotebookNativePreview: () => (
    <div data-testid="native-query-preview-sidebar" />
  ),
}));

interface SetupOpts {
  nativePermissions?: "write" | "none";
}

const setup = ({ nativePermissions = "none" }: SetupOpts = {}) => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase({ native_permissions: nativePermissions })],
  });
  const question = new Question(createSavedStructuredCard(), metadata);

  const state = createMockState({
    qb: createMockQueryBuilderState({
      uiControls: createMockQueryBuilderUIControlsState({
        // The user previously opened the SQL preview sidebar, so the persisted
        // UI control is on. The container must still refuse to render it for a
        // question whose database has no native write permission (e.g. usage
        // analytics), per metabase#49904.
        isShowingNotebookNativePreview: true,
      }),
    }),
  });

  return renderWithProviders(
    <NotebookContainer
      isOpen
      question={question}
      isDirty={false}
      isRunnable={false}
      isResultDirty={false}
      reportTimezone="UTC"
      updateQuestion={jest.fn().mockResolvedValue(undefined)}
    />,
    { storeInitialState: state },
  );
};

describe("NotebookContainer", () => {
  it("does not render the native query preview sidebar when the question's database lacks native write permission (metabase#49904)", () => {
    setup({ nativePermissions: "none" });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("renders the native query preview sidebar when the question's database has native write permission", () => {
    setup({ nativePermissions: "write" });

    expect(
      screen.getByTestId("native-query-preview-sidebar"),
    ).toBeInTheDocument();
  });
});
