import fetchMock from "fetch-mock";
import { SignJWT } from "jose";

import {
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { StaticQuestion } from "./StaticQuestion";

const SECRET = new TextEncoder().encode("test-secret-key-for-jwt-signing");

const TEST_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});

function getMockDataset(row: string) {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [TEST_COLUMN],
      rows: [[row]],
    }),
  });
}

async function createQuestionJwt(questionId: number) {
  return new SignJWT({
    resource: { question: questionId },
    params: {},
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(SECRET);
}

function setupEmbedCardEndpoints(token: string, card: Card, dataset: Dataset) {
  fetchMock.get(`path:/api/embed/card/${token}`, card);
  fetchMock.get(`path:/api/embed/card/${token}/query`, dataset);
}

describe("StaticQuestion - multiple guest questions", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should keep distinct questions when multiple guest StaticQuestions mount under one provider", async () => {
    const rows = ["Alpha", "Bravo"] as const;
    const cards = rows.map((row, index) =>
      createMockCard({
        id: index + 1,
        name: `Question ${row}`,
      }),
    );
    const tokens = await Promise.all(
      cards.map((card) => createQuestionJwt(card.id)),
    );

    const { state } = setupSdkState({
      sdkState: createMockSdkState({
        // Let initGuestEmbed run so /api → /api/embed request rewriting is installed.
        initStatus: createMockLoginStatusState({ status: "uninitialized" }),
        isGuestEmbed: true,
      }),
    });

    cards.forEach((card, index) => {
      setupEmbedCardEndpoints(tokens[index], card, getMockDataset(rows[index]));
    });

    const authConfig = createMockSdkConfig({ isGuest: true });

    const { rerender } = renderWithSDKProviders(
      <div>
        <StaticQuestion token={tokens[0]} />
      </div>,
      {
        componentProviderProps: { authConfig },
        storeInitialState: state,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });

    // Mount a second guest question under the same provider/store. Each mount
    // keeps its own guest token, so neither re-queries with the other's JWT.
    rerender(
      <div>
        <StaticQuestion token={tokens[0]} />
        <StaticQuestion token={tokens[1]} />
      </div>,
    );

    await waitFor(() => {
      for (const token of tokens) {
        expect(
          fetchMock.callHistory.calls(`path:/api/embed/card/${token}/query`),
        ).not.toHaveLength(0);
      }
    });

    await waitFor(() => {
      const tables = screen.getAllByTestId("table-root");
      const gridcells = screen.getAllByRole("gridcell");

      expect(tables).toHaveLength(rows.length);
      expect(gridcells).toHaveLength(rows.length);

      expect(within(gridcells[0]).getByText("Alpha")).toBeInTheDocument();
      expect(within(gridcells[1]).getByText("Bravo")).toBeInTheDocument();
      expect(screen.queryAllByText("Bravo")).toHaveLength(1);
      expect(screen.queryAllByText("Alpha")).toHaveLength(1);
    });
  });

  it("should query with the new token when a guest question remounts with a different token", async () => {
    const rows = ["Alpha", "Bravo"] as const;
    const cards = rows.map((row, index) =>
      createMockCard({
        id: index + 1,
        name: `Question ${row}`,
      }),
    );
    const tokens = await Promise.all(
      cards.map((card) => createQuestionJwt(card.id)),
    );

    const { state } = setupSdkState({
      sdkState: createMockSdkState({
        // Let initGuestEmbed run so /api → /api/embed request rewriting is installed.
        initStatus: createMockLoginStatusState({ status: "uninitialized" }),
        isGuestEmbed: true,
      }),
    });

    cards.forEach((card, index) => {
      setupEmbedCardEndpoints(tokens[index], card, getMockDataset(rows[index]));
    });

    // guestEmbedProviderUri installs the handler that rewrites every request
    // with the token held in the store.
    const authConfig = createMockSdkConfig({
      isGuest: true,
      guestEmbedProviderUri: "/mock-guest-token-provider",
    });

    const { rerender } = renderWithSDKProviders(
      <StaticQuestion key={tokens[0]} token={tokens[0]} />,
      {
        componentProviderProps: { authConfig },
        storeInitialState: state,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });

    // The iframe embed route re-keys its children when the token changes, so a
    // new token remounts the component rather than updating it in place.
    rerender(<StaticQuestion key={tokens[1]} token={tokens[1]} />);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/embed/card/${tokens[1]}/query`),
      ).not.toHaveLength(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Bravo")).toBeInTheDocument();
    });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});
