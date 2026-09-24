import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";

import { type SetupOpts, setup } from "./setup";

/** `dbname` and `user` are the required fields of the postgres test config */
const VALID_DETAILS = { dbname: "birds", user: "admin", password: "hunter2" };

const setupTestConnection = (opts: SetupOpts = {}) => {
  fetchMock.post("path:/api/database/validate", { valid: true });
  return setup(opts);
};

const clickTestConnection = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: /Test connection/i }),
  );
};

const findValidateRequests = async () => {
  const requests = await findRequests("POST");
  return requests.filter((request) =>
    request.url.includes("/api/database/validate"),
  );
};

describe("DatabaseForm > test connection", () => {
  it("should not test the connection when a required connection field is missing", async () => {
    setupTestConnection({
      initialValues: { engine: "postgres", name: "My database" },
    });

    await clickTestConnection();

    expect(await screen.findAllByText("required")).not.toHaveLength(0);
    expect(await findValidateRequests()).toHaveLength(0);
  });

  it("should omit the database id when adding a new database", async () => {
    setupTestConnection({
      initialValues: {
        engine: "postgres",
        name: "My database",
        details: VALID_DETAILS,
      },
    });

    await clickTestConnection();

    await waitFor(async () => {
      expect(await findValidateRequests()).toHaveLength(1);
    });

    const [request] = await findValidateRequests();
    expect(request.body).toMatchObject({
      details: { engine: "postgres", details: VALID_DETAILS },
    });
    expect(request.body.details).not.toHaveProperty("id");
  });

  it("should send the database id when editing an existing database", async () => {
    setupTestConnection({
      initialValues: {
        id: 42,
        engine: "postgres",
        name: "My database",
        details: VALID_DETAILS,
      },
    });

    await clickTestConnection();

    await waitFor(async () => {
      expect(await findValidateRequests()).toHaveLength(1);
    });

    const [request] = await findValidateRequests();
    expect(request.body).toMatchObject({
      details: { engine: "postgres", id: 42, details: VALID_DETAILS },
    });
  });
});
