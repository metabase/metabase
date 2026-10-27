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

type GlossaryServer = { glossary: GlossaryItem[] };

const BOAT: GlossaryItem = {
  id: 7,
  term: "Boat",
  definition: "A small vessel for traveling on water.",
};

const KITTEN: GlossaryItem = {
  id: 7,
  term: "Kitten",
  definition: "Young cat",
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
}

describe("GlossaryContainer", () => {
  it("lets the user manage the glossary when the API reports it as writable", async () => {
    setup({ canWrite: true });

    expect(await screen.findByDisplayValue("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).toBeInTheDocument();
  });

  it("makes the glossary read-only when the API reports it as not writable", async () => {
    setup({ canWrite: false });

    expect(await screen.findByDisplayValue("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).not.toBeInTheDocument();
  });

  it("creates, updates, and deletes definitions with trimmed API values", async () => {
    const server: GlossaryServer = { glossary: [] };
    setup({ canWrite: true, getGlossary: () => server.glossary });

    await assertCreateGlossaryTermFlow(server);

    await assertUpdateGlossaryTermFlow(server);

    await assertDeleteGlossaryTermFlow(server);
  });
});
