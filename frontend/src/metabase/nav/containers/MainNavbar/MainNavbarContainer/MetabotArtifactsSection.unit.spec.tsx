import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { push } from "react-router-redux";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { readArtifactDragData } from "metabase/metabot/components/MetabotBar/artifactDragData";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockCollectionItem,
  createMockUser,
} from "metabase-types/api/mocks";

import { MetabotArtifactsSection } from "./MetabotArtifactsSection";

jest.mock("react-router-redux", () => ({
  ...jest.requireActual("react-router-redux"),
  push: jest.fn((url: string) => ({ type: "TEST_PUSH", payload: url })),
}));

jest.mock("metabase/metabot/hooks", () => ({
  useUserMetabotPermissions: () => ({ hasMetabotAccess: true }),
}));

// the hover preview's heavy visualization rendering isn't what we're testing —
// stub the loader so the dropdown content is cheap to assert on
jest.mock(
  "metabase/collections/components/PinnedQuestionCard/PinnedQuestionLoader",
  () => ({
    __esModule: true,
    default: ({ id }: { id: number }) => (
      <div data-testid={`pinned-loader-${id}`} />
    ),
  }),
);

function createMockDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const dt = {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? "",
    setDragImage: () => {},
  };
  return dt as unknown as DataTransfer;
}

const PERSONAL_COLLECTION_ID = 100;

const ARTIFACTS = [
  { id: 22, name: "Revenue by month" },
  { id: 2, name: "Orders" },
];

function setup({ items = ARTIFACTS }: { items?: typeof ARTIFACTS } = {}) {
  setupCollectionItemsEndpoint({
    collection: { id: PERSONAL_COLLECTION_ID },
    collectionItems: items.map((item) =>
      createMockCollectionItem({ id: item.id, name: item.name, model: "card" }),
    ),
  });

  const onItemSelect = jest.fn();
  renderWithProviders(<MetabotArtifactsSection onItemSelect={onItemSelect} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({
        personal_collection_id: PERSONAL_COLLECTION_ID,
      }),
    }),
  });
  return { onItemSelect };
}

describe("MetabotArtifactsSection", () => {
  beforeEach(() => {
    jest.mocked(push).mockClear();
  });

  it("lists the artifact names", async () => {
    setup();
    for (const item of ARTIFACTS) {
      expect(await screen.findByText(item.name)).toBeInTheDocument();
    }
  });

  it("requests the personal collection filtered to ai_generated cards", async () => {
    setup();
    await screen.findByText("Revenue by month");

    const lastCall = fetchMock.callHistory.lastCall(
      `path:/api/collection/${PERSONAL_COLLECTION_ID}/items`,
    );
    const url = new URL(lastCall?.url ?? "", "http://localhost");
    expect(url.searchParams.get("ai_generated")).toBe("true");
    expect(url.searchParams.getAll("models")).toEqual(["card"]);
  });

  it("renders nothing when there are no artifacts", async () => {
    setup({ items: [] });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.lastCall(
          `path:/api/collection/${PERSONAL_COLLECTION_ID}/items`,
        ),
      ).toBeTruthy();
    });

    expect(
      screen.queryByTestId("metabot-artifacts-section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Artifacts" }),
    ).not.toBeInTheDocument();
  });

  it("writes the artifact payload to the dataTransfer on drag start", async () => {
    setup();
    await screen.findByText("Revenue by month");

    const [firstRow] = screen.getAllByTestId("metabot-artifact-row");
    const dataTransfer = createMockDataTransfer();
    fireEvent.dragStart(firstRow, { dataTransfer });

    expect(readArtifactDragData(dataTransfer)).toEqual({
      model: "card",
      id: 22,
    });

    // the drag ghost is appended to <body> and removed on a 0ms timer — let it
    // fire so the clone doesn't leak into later tests
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  it("navigates to the question and notifies on click", async () => {
    const { onItemSelect } = setup();

    await userEvent.click(await screen.findByText("Revenue by month"));

    expect(push).toHaveBeenCalledWith("/question/22");
    expect(onItemSelect).toHaveBeenCalled();
  });

  it("reveals a preview when an artifact is hovered", async () => {
    setup();

    const [firstRow] = await screen.findAllByTestId("metabot-artifact-row");
    await userEvent.hover(firstRow);

    expect(
      await screen.findByTestId("metabot-artifact-preview"),
    ).toBeInTheDocument();
  });
});
