import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateGlossaryEndpoint,
  setupCreateGlossaryEndpointWithError,
  setupDeleteGlossaryEndpoint,
  setupDeleteGlossaryEndpointWithError,
  setupListGlossaryEndpoint,
  setupUpdateGlossaryEndpoint,
  setupUpdateGlossaryEndpointWithError,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { GlossaryItem } from "metabase/api";
import { defer } from "metabase/utils/promise";
import { createMockUser } from "metabase-types/api/mocks";

import { GlossaryContainer } from "./GlossaryContainer";

// The API returns more than the editable fields, and none of the extras belong in a request body
const SERVER_FIELDS = {
  created_at: "2026-11-03T12:00:00Z",
  creator_id: 1,
};

const GLOSSARY: GlossaryItem[] = [
  {
    id: 1,
    term: "ARR",
    definition: "Annual recurring revenue",
    ...SERVER_FIELDS,
  },
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
    withUndos: true,
  });
};

const getNewTermButton = () =>
  screen.queryByRole("button", { name: /new term/i });

const getTable = () => screen.getByRole("table");

const getRequestBody = (url: string, method: "POST" | "PUT"): unknown => {
  const body = fetchMock.callHistory.lastCall(url, { method })?.options.body;
  if (body == null) {
    return undefined;
  }
  const parsedBody: unknown = JSON.parse(body.toString());
  return parsedBody;
};

type GlossaryServer = { glossary: GlossaryItem[] };

const BOAT: GlossaryItem = {
  id: 7,
  term: "Boat",
  definition: "A small vessel for traveling on water.",
  ...SERVER_FIELDS,
};

const KITTEN: GlossaryItem = {
  id: 7,
  term: "Kitten",
  definition: "Young cat",
  ...SERVER_FIELDS,
};

async function assertCreateGlossaryTermFlow(server: GlossaryServer) {
  const createResponse = defer<GlossaryItem>();
  setupCreateGlossaryEndpoint(() => createResponse.promise);

  await userEvent.click(
    await screen.findByRole("button", { name: /new term/i }),
  );
  await userEvent.type(screen.getByPlaceholderText(/boat/i), "  Boat  ");
  await userEvent.type(
    screen.getByPlaceholderText(/a small vessel.*/i),
    "  A small vessel for traveling on water.  {Enter}",
  );

  await waitFor(() =>
    expect(
      fetchMock.callHistory.called("path:/api/glossary", { method: "POST" }),
    ).toBe(true),
  );
  // The row shown while the request is pending is replaced by the server's row.
  const pendingTerm = within(getTable()).getByDisplayValue("Boat");
  server.glossary = [BOAT];
  createResponse.resolve(BOAT);
  await waitFor(() => expect(pendingTerm).not.toBeInTheDocument());

  expect(getRequestBody("path:/api/glossary", "POST")).toEqual({
    term: "Boat",
    definition: "A small vessel for traveling on water.",
  });
  expect(within(getTable()).getByDisplayValue("Boat")).toBeInTheDocument();
  expect(
    within(getTable()).getByDisplayValue(
      "A small vessel for traveling on water.",
    ),
  ).toBeInTheDocument();
  expect(await screen.findByText("Term added")).toBeInTheDocument();
}

async function assertUpdateGlossaryTermFlow(server: GlossaryServer) {
  setupUpdateGlossaryEndpoint(KITTEN);

  server.glossary = [{ ...BOAT, term: KITTEN.term }];
  const term = within(getTable()).getByDisplayValue("Boat");
  await userEvent.clear(term);
  await userEvent.type(term, "Kitten{Enter}");
  await waitFor(() =>
    expect(getRequestBody("path:/api/glossary/7", "PUT")).toEqual({
      term: "Kitten",
      definition: "A small vessel for traveling on water.",
    }),
  );

  server.glossary = [KITTEN];
  const definition = within(getTable()).getByDisplayValue(
    "A small vessel for traveling on water.",
  );
  await userEvent.clear(definition);
  await userEvent.type(definition, "Young cat{Enter}");
  await waitFor(() =>
    expect(getRequestBody("path:/api/glossary/7", "PUT")).toEqual({
      term: "Kitten",
      definition: "Young cat",
    }),
  );

  expect(
    await within(getTable()).findByDisplayValue("Kitten"),
  ).toBeInTheDocument();
  expect(within(getTable()).getByDisplayValue("Young cat")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getAllByText("Term updated")).toHaveLength(2),
  );
}

async function assertDeleteGlossaryTermFlow(server: GlossaryServer) {
  setupDeleteGlossaryEndpoint(KITTEN.id);

  server.glossary = [];
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
    expect(
      within(getTable()).queryByDisplayValue("Kitten"),
    ).not.toBeInTheDocument(),
  );
  expect(await screen.findByText("Term deleted")).toBeInTheDocument();
}

describe("GlossaryContainer", () => {
  it("lets the user manage the glossary when the API reports it as writable", async () => {
    setup({ canWrite: true });

    expect(await screen.findByDisplayValue("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).toBeInTheDocument();
  });

  it("makes the glossary read-only when the API reports it as not writable", async () => {
    setup({ canWrite: false });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(within(getTable()).queryByRole("textbox")).not.toBeInTheDocument();
    expect(getNewTermButton()).not.toBeInTheDocument();
  });

  it("creates, updates, and deletes definitions with trimmed API values", async () => {
    const server: GlossaryServer = { glossary: [] };
    setup({ canWrite: true, getGlossary: () => server.glossary });

    await assertCreateGlossaryTermFlow(server);

    await assertUpdateGlossaryTermFlow(server);

    await assertDeleteGlossaryTermFlow(server);
  });

  it("keeps the typed term in the new row and reports the error when adding it fails", async () => {
    setup({ canWrite: true });
    setupCreateGlossaryEndpointWithError();

    await userEvent.click(
      await screen.findByRole("button", { name: /new term/i }),
    );
    await userEvent.type(screen.getByPlaceholderText(/boat/i), "Boat");
    await userEvent.type(
      screen.getByPlaceholderText(/a small vessel.*/i),
      "A small vessel{Enter}",
    );

    expect(await screen.findByText("Failed to add term")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/boat/i)).toHaveValue("Boat");
    expect(screen.getByPlaceholderText(/a small vessel.*/i)).toHaveValue(
      "A small vessel",
    );
    expect(
      screen.queryByText("This term already exists in the Glossary"),
    ).not.toBeInTheDocument();
    expect(
      within(getTable()).getAllByRole("textbox", { name: "Term" }),
    ).toHaveLength(2);
  });

  it("reverts the field and reports the error when updating fails", async () => {
    setup({ canWrite: true });
    setupUpdateGlossaryEndpointWithError(GLOSSARY[0].id);

    const term = await within(getTable()).findByDisplayValue("ARR");
    await userEvent.clear(term);
    await userEvent.type(term, "MRR{Enter}");

    expect(
      await screen.findByText("Failed to update term"),
    ).toBeInTheDocument();
    expect(
      await within(getTable()).findByDisplayValue("ARR"),
    ).toBeInTheDocument();
    expect(
      within(getTable()).queryByDisplayValue("MRR"),
    ).not.toBeInTheDocument();
  });

  it("keeps the entry and reports the error when deleting fails", async () => {
    setup({ canWrite: true });
    setupDeleteGlossaryEndpointWithError(GLOSSARY[0].id);

    await userEvent.click(
      await within(getTable()).findByRole("button", { name: /delete/i }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /delete/i,
      }),
    );

    expect(
      await screen.findByText("Failed to delete term"),
    ).toBeInTheDocument();
    expect(
      await within(getTable()).findByDisplayValue("ARR"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
