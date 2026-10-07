import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import type { ValidateDatabaseResponse } from "metabase-types/api";

import { type SetupOpts, setup } from "./setup";

/** `dbname` and `user` are the required fields of the postgres test config */
const VALID_DETAILS = { dbname: "birds", user: "admin", password: "hunter2" };

const POSTGRES_VALUES: SetupOpts["initialValues"] = {
  engine: "postgres",
  name: "My database",
  details: VALID_DETAILS,
};

const setupTestConnection = ({
  validateResponse = { valid: true },
  validateDelayMs = 0,
  ...opts
}: SetupOpts & {
  validateResponse?:
    | ValidateDatabaseResponse
    | { status: number; body: { message: string } };
  validateDelayMs?: number;
} = {}) => {
  fetchMock.post("path:/api/database/validate", validateResponse, {
    delay: validateDelayMs,
  });
  return setup(opts);
};

const getTestConnectionButton = () =>
  screen.getByRole("button", { name: /Test connection/i });

const clickTestConnection = async () => {
  await userEvent.click(getTestConnectionButton());
};

const findValidateRequests = async () => {
  const requests = await findRequests("POST");
  return requests.filter((request) =>
    request.url.includes("/api/database/validate"),
  );
};

describe("DatabaseForm > test connection", () => {
  it("should not test the connection when a required connection field is missing", async () => {
    await setupTestConnection({
      initialValues: { engine: "postgres", name: "My database" },
    });

    await clickTestConnection();

    expect(await screen.findAllByText("required")).not.toHaveLength(0);
    expect(await findValidateRequests()).toHaveLength(0);
  });

  it.each([
    { name: "omit the id for a new database", id: undefined },
    { name: "send the id for an existing database", id: 42 },
  ])("should $name", async ({ id }) => {
    await setupTestConnection({ initialValues: { ...POSTGRES_VALUES, id } });

    await clickTestConnection();

    await waitFor(async () => {
      expect(await findValidateRequests()).toHaveLength(1);
    });
    const [request] = await findValidateRequests();
    expect(request.body.details).toMatchObject({
      engine: "postgres",
      details: VALID_DETAILS,
    });
    expect(request.body.details.id).toBe(id);
  });

  it("should show the result until the form is edited, including while re-testing", async () => {
    await setupTestConnection({
      initialValues: POSTGRES_VALUES,
      validateDelayMs: 200,
    });

    await clickTestConnection();
    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();

    await clickTestConnection();
    expect(screen.getByLabelText("Connection successful")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await findValidateRequests()).toHaveLength(2);
    });
    expect(screen.getByLabelText("Connection successful")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Host"), "x");
    expect(
      screen.queryByLabelText("Connection successful"),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "an invalid connection",
      validateResponse: { valid: false, message: "Password is incorrect" },
      message: "Password is incorrect",
    },
    {
      name: "a failed request",
      validateResponse: { status: 500, body: { message: "Server exploded" } },
      message: "Server exploded",
    },
  ])(
    "should show the error in the failure icon's tooltip for $name",
    async ({ validateResponse, message }) => {
      await setupTestConnection({
        initialValues: POSTGRES_VALUES,
        validateResponse,
      });

      await clickTestConnection();
      expect(
        await screen.findByLabelText("Connection failed"),
      ).toBeInTheDocument();

      await userEvent.hover(getTestConnectionButton());
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      await userEvent.hover(screen.getByLabelText("Connection failed"));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(message);
    },
  );

  it("should delay the loader and ignore clicks while a test is running", async () => {
    await setupTestConnection({
      initialValues: POSTGRES_VALUES,
      validateDelayMs: 800,
    });

    await clickTestConnection();
    expect(getTestConnectionButton()).not.toHaveAttribute("data-loading");

    await clickTestConnection();
    await waitFor(() =>
      expect(getTestConnectionButton()).toHaveAttribute("data-loading", "true"),
    );

    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();
    expect(getTestConnectionButton()).not.toHaveAttribute("data-loading");
    expect(await findValidateRequests()).toHaveLength(1);
  });
});
