import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardDashboardsEndpoint } from "__support__/server-mocks/card";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NotebookNativePreview } from "./NotebookNativePreview";

jest.mock(
  "metabase/querying/notebook/components/NotebookNativePreview",
  () => ({
    NotebookNativePreview: ({
      question,
      onConvertClick,
    }: {
      question: Question;
      onConvertClick: (q: Question) => void;
    }) => (
      <button
        data-testid="convert-trigger"
        onClick={() => onConvertClick(question)}
      >
        convert
      </button>
    ),
  }),
);

const CARD_ID = 42;

interface SetupOpts {
  cardOverrides?: Partial<Card>;
  embeddedDashboards?: { id: number; name: string }[];
  plainDashboards?: { id: number; name: string }[];
}

const setup = ({
  cardOverrides,
  embeddedDashboards = [],
  plainDashboards = [],
}: SetupOpts = {}) => {
  const card = createMockCard({
    id: CARD_ID,
    enable_embedding: false,
    ...cardOverrides,
  });

  setupCardDashboardsEndpoint(card.id, [
    ...embeddedDashboards.map((d) => ({ ...d, enable_embedding: true })),
    ...plainDashboards.map((d) => ({ ...d, enable_embedding: false })),
  ]);

  const state = createMockState({
    qb: createMockQueryBuilderState({ card }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });

  return renderWithProviders(<NotebookNativePreview />, {
    storeInitialState: state,
  });
};

describe("NotebookNativePreview (controlled wrapper)", () => {
  it("converts directly when the question is not embedded and not in any embedded dashboard", async () => {
    setup({
      plainDashboards: [{ id: 1, name: "Plain Dashboard" }],
    });

    await userEvent.click(await screen.findByTestId("convert-trigger"));

    expect(
      screen.queryByText(/Convert this question to SQL\?/),
    ).not.toBeInTheDocument();
  });

  it("warns before converting when the question itself is embedded", async () => {
    setup({ cardOverrides: { enable_embedding: true } });

    await userEvent.click(await screen.findByTestId("convert-trigger"));

    expect(
      await screen.findByText(/Convert this question to SQL\?/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/may silently break dashboard filters/),
    ).toBeInTheDocument();
  });

  it("warns before converting when the question appears in an embedded dashboard", async () => {
    setup({
      embeddedDashboards: [{ id: 10, name: "Embedded Dashboard" }],
    });

    // Wait for the dashboards endpoint to be hit so the wrapper knows the
    // card is in an embedded dashboard before the user clicks.
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(`path:/api/card/${CARD_ID}/dashboards`),
      ).toBe(true);
    });

    await userEvent.click(await screen.findByTestId("convert-trigger"));

    expect(
      await screen.findByText(/Convert this question to SQL\?/),
    ).toBeInTheDocument();
  });

  it("does not warn when the question only appears in non-embedded dashboards", async () => {
    setup({
      plainDashboards: [{ id: 5, name: "Some Dashboard" }],
    });

    await userEvent.click(await screen.findByTestId("convert-trigger"));

    expect(
      screen.queryByText(/Convert this question to SQL\?/),
    ).not.toBeInTheDocument();
  });

  it("cancels the conversion when the user clicks Cancel in the warning modal", async () => {
    setup({ cardOverrides: { enable_embedding: true } });

    await userEvent.click(await screen.findByTestId("convert-trigger"));

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    expect(
      screen.queryByText(/Convert this question to SQL\?/),
    ).not.toBeInTheDocument();
  });

  it("closes the warning modal after the user confirms the conversion", async () => {
    setup({ cardOverrides: { enable_embedding: true } });

    await userEvent.click(await screen.findByTestId("convert-trigger"));

    await userEvent.click(
      await screen.findByRole("button", { name: "Convert to SQL" }),
    );

    expect(
      screen.queryByText(/Convert this question to SQL\?/),
    ).not.toBeInTheDocument();
  });
});
