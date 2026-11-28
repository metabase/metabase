import fetchMock from "fetch-mock";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupNativeDatasetEndpoint,
  setupNativeQuerySnippetEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { setupCardDashboardsEndpoint } from "__support__/server-mocks/card";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Database } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NotebookContainer } from "./NotebookContainer";

// The notebook editor itself is out of scope here
jest.mock("metabase/querying/notebook/components/Notebook", () => ({
  Notebook: () => <div data-testid="notebook" />,
}));

const CARD = createMockCard({
  id: 1,
  name: "Question views last week",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
});

interface SetupOpts {
  database: Database;
  windowWidthPx?: number;
  sidebarWidth?: number | null;
}

const ROOT_FONT_SIZE_PX = 16;

// Sets the window width read by `useWindowSize` and evaluates
// `(max-width: Nem)` media queries against it
function mockWindowWidth(windowWidthPx: number) {
  jest.replaceProperty(window, "innerWidth", windowWidthPx);
  jest.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const maxWidthEm = /max-width:\s*([\d.]+)em/.exec(query)?.[1];
    const matches =
      maxWidthEm != null &&
      windowWidthPx <= Number(maxWidthEm) * ROOT_FONT_SIZE_PX;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  });
}

const setup = ({
  database,
  windowWidthPx = 1280,
  sidebarWidth = null,
}: SetupOpts) => {
  mockWindowWidth(windowWidthPx);
  setupUpdateSettingEndpoint();
  setupNativeDatasetEndpoint();
  setupNativeQuerySnippetEndpoints();
  setupCardDashboardsEndpoint(CARD.id, []);

  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: CARD,
      uiControls: createMockQueryBuilderUIControlsState({
        queryBuilderMode: "notebook",
        // left open from a previous question
        isShowingNotebookNativePreview: true,
        notebookNativePreviewSidebarWidth: sidebarWidth,
      }),
    }),
    entities: createMockEntitiesState({
      databases: [database],
      questions: [CARD],
    }),
  });
  const question = new Question(CARD, createMockMetadataFromState(state));

  renderWithProviders(
    <NotebookContainer
      isOpen
      question={question}
      isDirty={false}
      isRunnable
      isResultDirty={false}
      reportTimezone="UTC"
      readOnly={false}
      updateQuestion={jest.fn()}
      runQuestionQuery={jest.fn()}
      setQueryBuilderMode={jest.fn()}
    />,
    { storeInitialState: state },
  );
};

const MIN_SIDEBAR_WIDTH = 428;
const MIN_NOTEBOOK_WIDTH = 640;

function getSidebarWidth() {
  const sidebar = screen.getByTestId("native-query-preview-sidebar");
  const box = sidebar.closest<HTMLElement>(".react-resizable");
  return box?.style.width;
}

// jsdom has no layout, so react-resizable computes the new width from the
// pointer movement alone
function dragResizeHandle(deltaX: number) {
  const handle = screen.getByTestId("notebook-native-preview-resize-handle");
  const startX = 1000;
  fireEvent.mouseDown(handle, { button: 0, clientX: startX, clientY: 0 });
  fireEvent.mouseMove(document, { clientX: startX + deltaX, clientY: 0 });
  fireEvent.mouseUp(document, { clientX: startX + deltaX, clientY: 0 });
}

function getSavedSidebarWidths() {
  return fetchMock.callHistory.calls("update-setting").map((call) => ({
    url: new URL(call.url).pathname,
    body: JSON.parse(String(call.options.body)),
  }));
}

describe("NotebookContainer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the native query preview sidebar when it is open and the user can write native queries", async () => {
    setup({ database: createSampleDatabase() });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeVisible();
  });

  it("does not show the native query preview sidebar without native write permissions, like on the instance analytics database (metabase#49904)", () => {
    setup({ database: createSampleDatabase({ native_permissions: "none" }) });

    expect(screen.getByTestId("notebook")).toBeInTheDocument();
    expect(
      screen.queryByTestId("native-query-preview-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("shows the native query preview at full width on a small screen (metabase#67767)", async () => {
    setup({ database: createSampleDatabase(), windowWidthPx: 630 });

    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeVisible();
    expect(
      screen.queryByTestId("notebook-native-preview-resize-handle"),
    ).not.toBeInTheDocument();
  });

  it("shows the native query preview in a resizable sidebar on a wider screen (metabase#67767)", async () => {
    setup({ database: createSampleDatabase(), windowWidthPx: 700 });

    expect(
      await screen.findByTestId("native-query-preview-sidebar"),
    ).toBeVisible();
    expect(
      screen.getByTestId("notebook-native-preview-resize-handle"),
    ).toBeInTheDocument();
  });

  describe("resizing the sidebar", () => {
    it("opens the sidebar at its min width when the user has not resized it", async () => {
      setup({ database: createSampleDatabase() });

      await screen.findByTestId("native-query-preview-sidebar");
      expect(getSidebarWidth()).toBe(`${MIN_SIDEBAR_WIDTH}px`);
    });

    it("opens the sidebar at the width the user saved", async () => {
      setup({ database: createSampleDatabase(), sidebarWidth: 555 });

      await screen.findByTestId("native-query-preview-sidebar");
      expect(getSidebarWidth()).toBe("555px");
    });

    it("does not shrink the sidebar below its min width, and saves that width", async () => {
      setup({ database: createSampleDatabase() });
      await screen.findByTestId("native-query-preview-sidebar");

      // the handle is on the left edge, so moving it right shrinks the sidebar
      dragResizeHandle(200);

      await waitFor(() =>
        expect(getSavedSidebarWidths()).toEqual([
          {
            url: "/api/setting/notebook-native-preview-sidebar-width",
            body: { value: MIN_SIDEBAR_WIDTH },
          },
        ]),
      );
      expect(getSidebarWidth()).toBe(`${MIN_SIDEBAR_WIDTH}px`);
    });

    it("grows the sidebar up to the space the notebook leaves, and saves that width", async () => {
      const windowWidthPx = 1280;
      const maxSidebarWidth = windowWidthPx - MIN_NOTEBOOK_WIDTH;
      setup({ database: createSampleDatabase(), windowWidthPx });
      await screen.findByTestId("native-query-preview-sidebar");

      dragResizeHandle(-100);

      await waitFor(() =>
        expect(getSavedSidebarWidths()).toEqual([
          {
            url: "/api/setting/notebook-native-preview-sidebar-width",
            body: { value: MIN_SIDEBAR_WIDTH + 100 },
          },
        ]),
      );
      expect(getSidebarWidth()).toBe(`${MIN_SIDEBAR_WIDTH + 100}px`);

      dragResizeHandle(-500);

      await waitFor(() => expect(getSavedSidebarWidths()).toHaveLength(2));
      expect(getSavedSidebarWidths()[1].body).toEqual({
        value: maxSidebarWidth,
      });
      expect(getSidebarWidth()).toBe(`${maxSidebarWidth}px`);
    });
  });
});
