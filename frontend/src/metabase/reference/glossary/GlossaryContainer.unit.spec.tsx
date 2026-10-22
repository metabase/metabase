import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateGlossaryEndpoint,
  setupDeleteGlossaryEndpoint,
  setupListGlossaryEndpoint,
  setupUpdateGlossaryEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { GlossaryItem } from "metabase/api";
import { defer } from "metabase/utils/promise";
import { createMockUser } from "metabase-types/api/mocks";

import { GlossaryContainer } from "./GlossaryContainer";

const GLOSSARY: GlossaryItem[] = [
  { id: 1, term: "ARR", definition: "Annual recurring revenue" },
];

type SetupOpts = {
  canWrite: boolean;
  getGlossary?: () => GlossaryItem[];
};

// Writability comes from the API: `can_write` mirrors api/entitled-data-analyst?, which gates the
// glossary write endpoints, so the container never has to reason about roles or token features itself.
const setup = ({ canWrite, getGlossary = () => GLOSSARY }: SetupOpts) => {
  setupListGlossaryEndpoint(() => ({
    data: getGlossary(),
    can_write: canWrite,
  }));

  renderWithProviders(<GlossaryContainer />, {
    storeInitialState: createMockState({
      currentUser: createMockUser(),
    }),
    withRouter: true,
  });
};

const getNewTermButton = () => screen.queryByRole("button", { name: /term/i });

const getTable = () => screen.getByRole("table");

const getRequestBody = (url: string, method: "POST" | "PUT"): unknown => {
  const body = fetchMock.callHistory.lastCall(url, { method })?.options.body;
  if (body == null) {
    return undefined;
  }
  const parsedBody: unknown = JSON.parse(body.toString());
  return parsedBody;
};

describe("GlossaryContainer", () => {
  it("lets the user manage the glossary when the API reports it as writable", async () => {
    setup({ canWrite: true });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).toBeInTheDocument();
  });

  it("makes the glossary read-only when the API reports it as not writable", async () => {
    setup({ canWrite: false });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).not.toBeInTheDocument();
  });

  it("creates, updates, and deletes definitions with trimmed API values", async () => {
    const boat: GlossaryItem = {
      id: 7,
      term: "Boat",
      definition: "A small vessel for traveling on water.",
    };
    const kitten: GlossaryItem = {
      id: 7,
      term: "Kitten",
      definition: "Young cat",
    };
    let glossary: GlossaryItem[] = [];
    const createResponse = defer<GlossaryItem>();
    setupCreateGlossaryEndpoint(() => createResponse.promise);
    setupUpdateGlossaryEndpoint(kitten);
    setupDeleteGlossaryEndpoint(kitten.id);
    setup({ canWrite: true, getGlossary: () => glossary });

    await userEvent.click(
      await screen.findByRole("button", { name: /new term/i }),
    );
    await userEvent.type(screen.getByPlaceholderText(/boat/i), "  Boat  ");
    await userEvent.type(
      screen.getByPlaceholderText(/a small vessel.*/i),
      "  A small vessel for traveling on water.  ",
    );
    await userEvent.click(screen.getByLabelText("Save"));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/glossary", { method: "POST" }),
      ).toBe(true),
    );
    // The row shown while the request is pending is replaced by the server's row.
    const optimisticTerm = within(getTable()).getByText("Boat");
    glossary = [boat];
    createResponse.resolve(boat);
    await waitFor(() => expect(optimisticTerm).not.toBeInTheDocument());
    expect(getRequestBody("path:/api/glossary", "POST")).toEqual({
      term: "Boat",
      definition: "A small vessel for traveling on water.",
    });
    expect(within(getTable()).getByText("Boat")).toBeInTheDocument();
    expect(
      within(getTable()).getByText("A small vessel for traveling on water."),
    ).toBeInTheDocument();

    await userEvent.click(within(getTable()).getByText("Boat"));
    await userEvent.clear(screen.getByPlaceholderText(/boat/i));
    await userEvent.type(screen.getByPlaceholderText(/boat/i), "Kitten");
    await userEvent.clear(screen.getByPlaceholderText(/a small vessel.*/i));
    await userEvent.type(
      screen.getByPlaceholderText(/a small vessel.*/i),
      "Young cat",
    );
    glossary = [kitten];
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(getRequestBody("path:/api/glossary/7", "PUT")).toEqual({
        term: "Kitten",
        definition: "Young cat",
      }),
    );
    expect(await within(getTable()).findByText("Kitten")).toBeInTheDocument();
    expect(within(getTable()).getByText("Young cat")).toBeInTheDocument();

    glossary = [];
    await userEvent.click(
      within(getTable()).getByRole("button", { name: /delete/i }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /delete/i,
      }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/glossary/7", {
          method: "DELETE",
        }),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(within(getTable()).queryByText("Kitten")).not.toBeInTheDocument(),
    );
  });
});
