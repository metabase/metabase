import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type {
  ParametersForActionExecution,
  PublicWritebackAction,
} from "metabase-types/api";
import {
  createMockActionParameter,
  createMockPublicAction,
} from "metabase-types/api/mocks";

import PublicApp from "../PublicApp";

import PublicAction from "./PublicActionLoader";

const TEST_PUBLIC_ID = "test-public-id";

const SIZE_PARAMETER = createMockActionParameter({
  id: "size",
  name: "Size",
  "display-name": "Size",
  type: "number/=",
  slug: "size",
  target: ["variable", ["template-tag", "size"]],
});

const COLOR_PARAMETER = createMockActionParameter({
  id: "color",
  name: "Color",
  "display-name": "Color",
  type: "string/=",
  slug: "color",
  target: ["variable", ["template-tag", "color"]],
});

const TEST_ACTION = createMockPublicAction({
  name: "Giving out t-shirts",
  parameters: [SIZE_PARAMETER, COLOR_PARAMETER],
});

type ExecuteActionRequestBody = {
  parameters: ParametersForActionExecution;
};

async function setup({
  action = TEST_ACTION,
  shouldFetchFail = false,
  shouldExecutionFail = false,
}: {
  action?: PublicWritebackAction;
  expectedRequestBody?: ExecuteActionRequestBody;
  shouldFetchFail?: boolean;
  shouldExecutionFail?: boolean;
} = {}) {
  fetchMock.get(`path:/api/public/action/${TEST_PUBLIC_ID}`, {
    status: shouldFetchFail ? 404 : 200,
    body: shouldFetchFail ? { message: "Not found" } : action,
  });

  const executionResponse = shouldExecutionFail
    ? { message: "Something's off" }
    : { "rows-affected": [1] };

  fetchMock.post(`path:/api/public/action/${TEST_PUBLIC_ID}/execute`, {
    status: shouldExecutionFail ? 400 : 200,
    body: executionResponse,
  });

  renderWithProviders(
    <Route
      path="/public/action/:uuid"
      component={props => (
        <PublicApp {...props}>
          <PublicAction {...props} />
        </PublicApp>
      )}
    />,
    {
      mode: "public",
      initialRoute: `/public/action/${TEST_PUBLIC_ID}`,
      withRouter: true,
    },
  );

  await waitForLoaderToBeRemoved();
}

describe("PublicAction", () => {
  it("shows acton form", async () => {
    await setup();

    expect(
      screen.getByRole("heading", { name: TEST_ACTION.name }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(SIZE_PARAMETER.name)).toBeInTheDocument();
    expect(screen.getByLabelText(COLOR_PARAMETER.name)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    ).toBeInTheDocument();
  });

  it("should allow to submit a clean form if all parameters are optional", async () => {
    await setup();
    expect(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    ).toBeEnabled();
  });

  it("doesn't let to submit until required parameters are filled", async () => {
    const action = {
      ...TEST_ACTION,
      parameters: [SIZE_PARAMETER, { ...COLOR_PARAMETER, required: true }],
    };
    await setup({ action });

    await userEvent.type(screen.getByLabelText("Size"), "42");
    expect(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    ).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Color"), "metablue");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: TEST_ACTION.name }),
      ).toBeEnabled(),
    );
  });

  it("submits form correctly", async () => {
    await setup({
      expectedRequestBody: {
        parameters: {
          [SIZE_PARAMETER.id]: "42",
          [COLOR_PARAMETER.id]: "metablue",
        },
      },
    });

    await userEvent.type(screen.getByLabelText("Size"), "42");
    await userEvent.type(screen.getByLabelText("Color"), "metablue");
    await userEvent.click(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    );

    await waitFor(() => {
      expect(
        fetchMock.done(`path:/api/public/action/${TEST_PUBLIC_ID}/execute`),
      ).toBe(true);
    });
  });

  it("shows a message on successful submit", async () => {
    await setup();

    await userEvent.type(screen.getByLabelText("Size"), "42");
    await userEvent.type(screen.getByLabelText("Color"), "metablue");
    await userEvent.click(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    );

    expect(
      await screen.findByText(`${TEST_ACTION.name} ran successfully`),
    ).toBeInTheDocument();
    expect(screen.queryByText(TEST_ACTION.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("shows error if can't fetch action", async () => {
    await setup({ shouldExecutionFail: true });

    await userEvent.type(screen.getByLabelText("Size"), "42");
    await userEvent.type(screen.getByLabelText("Color"), "metablue");
    await userEvent.click(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    );

    expect(await screen.findByText("Something's off")).toBeInTheDocument();
  });

  it("shows error if action fails", async () => {
    await setup({ shouldFetchFail: true });
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("handles actions without parameters", async () => {
    await setup({
      action: { ...TEST_ACTION, parameters: [] },
      expectedRequestBody: { parameters: {} },
    });

    expect(
      screen.getByRole("heading", { name: TEST_ACTION.name }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: TEST_ACTION.name }),
    );
    await waitFor(() =>
      expect(
        fetchMock.done(`path:/api/public/action/${TEST_PUBLIC_ID}/execute`),
      ).toBe(true),
    );
  });
});
