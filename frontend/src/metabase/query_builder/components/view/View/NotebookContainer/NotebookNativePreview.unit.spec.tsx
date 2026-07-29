import userEvent from "@testing-library/user-event";

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

// The inner controlled component disables its Convert button while the
// embedded-dashboards query is loading. The mock mirrors that contract so the
// tests exercise the wrapper's logic only after the data is in.
jest.mock(
  "metabase/querying/notebook/components/NotebookNativePreview",
  () => ({
    NotebookNativePreview: ({
      question,
      onConvertClick,
      disableConvert,
    }: {
      question: Question;
      onConvertClick: (q: Question) => void;
      disableConvert?: boolean;
    }) => (
      <button
        data-testid="convert-trigger"
        onClick={() => onConvertClick(question)}
        disabled={disableConvert}
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

const clickConvert = async () => {
  const button = await screen.findByTestId("convert-trigger");
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
};

describe("NotebookNativePreview (controlled wrapper)", () => {
  it("converts directly when the question is not embedded and not in any embedded dashboard", async () => {
    setup({
      plainDashboards: [{ id: 1, name: "Plain Dashboard" }],
    });

    await clickConvert();

    expect(
      screen.queryByText(/Converting this question to SQL will break/),
    ).not.toBeInTheDocument();
  });

  it("warns before converting when the question itself is embedded", async () => {
    setup({ cardOverrides: { enable_embedding: true } });

    await clickConvert();

    expect(
      await screen.findByText(/Converting this question to SQL will break/),
    ).toBeInTheDocument();
    expect(screen.getByText(/won't include SQL variables/)).toBeInTheDocument();
  });

  it("warns before converting when the question appears in an embedded dashboard", async () => {
    setup({
      embeddedDashboards: [{ id: 10, name: "Embedded Dashboard" }],
    });

    await clickConvert();

    expect(
      await screen.findByText(/Converting this question to SQL will break/),
    ).toBeInTheDocument();
  });

  it("does not warn when the question only appears in non-embedded dashboards", async () => {
    setup({
      plainDashboards: [{ id: 5, name: "Some Dashboard" }],
    });

    await clickConvert();

    expect(
      screen.queryByText(/Converting this question to SQL will break/),
    ).not.toBeInTheDocument();
  });

  it("cancels the conversion when the user clicks Cancel in the warning modal", async () => {
    setup({ cardOverrides: { enable_embedding: true } });

    await clickConvert();

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    expect(
      screen.queryByText(/Converting this question to SQL will break/),
    ).not.toBeInTheDocument();
  });

  it("closes the warning modal after the user confirms the conversion", async () => {
    setup({ cardOverrides: { enable_embedding: true } });

    await clickConvert();

    await userEvent.click(
      await screen.findByRole("button", { name: "Convert to SQL" }),
    );

    expect(
      screen.queryByText(/Converting this question to SQL will break/),
    ).not.toBeInTheDocument();
  });
});
