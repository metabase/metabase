import React from "react";
import { Route } from "react-router";
import nock from "nock";
import userEvent from "@testing-library/user-event";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForElementToBeRemoved,
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
  type: "number/=",
  slug: "size",
  target: ["variable", ["template-tag", "size"]],
});

const COLOR_PARAMETER = createMockActionParameter({
  id: "color",
  name: "Color",
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
  expectedRequestBody,
  shouldFetchFail = false,
  shouldExecutionFail = false,
}: {
  action?: PublicWritebackAction;
  expectedRequestBody?: ExecuteActionRequestBody;
  shouldFetchFail?: boolean;
  shouldExecutionFail?: boolean;
} = {}) {
  const scope = nock(location.origin);

  scope
    .get(`/api/public/action/${TEST_PUBLIC_ID}`)
    .reply(
      shouldFetchFail ? 404 : 200,
      shouldFetchFail ? { message: "Not found" } : action,
    );

  const executionResponse = shouldExecutionFail
    ? { message: "Something's off" }
    : { "rows-affected": [1] };

  const executeActionEndpointSpy = scope
    .post(`/api/public/action/${TEST_PUBLIC_ID}/execute`, expectedRequestBody)
    .reply(shouldExecutionFail ? 400 : 200, executionResponse);

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

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  return { executeActionEndpointSpy };
}

describe("PublicAction", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it("shows acton form", async () => {
    await setup();

    expect(screen.getByText(TEST_ACTION.name)).toBeInTheDocument();
    expect(screen.getByLabelText(SIZE_PARAMETER.name)).toBeInTheDocument();
    expect(screen.getByLabelText(COLOR_PARAMETER.name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("doesn't let to submit a clean form", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("submits form correctly", async () => {
    const { executeActionEndpointSpy } = await setup({
      expectedRequestBody: {
        parameters: {
          [SIZE_PARAMETER.id]: "42",
          [COLOR_PARAMETER.id]: "metablue",
        },
      },
    });

    userEvent.type(screen.getByLabelText("Size"), "42");
    userEvent.type(screen.getByLabelText("Color"), "metablue");
    userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(executeActionEndpointSpy.isDone()).toBe(true);
    });
  });

  it("shows a message on successful submit", async () => {
    await setup();

    userEvent.type(screen.getByLabelText("Size"), "42");
    userEvent.type(screen.getByLabelText("Color"), "metablue");
    userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      await screen.findByText("Thanks for your submission."),
    ).toBeInTheDocument();
    expect(screen.queryByText(TEST_ACTION.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("shows error if can't fetch action", async () => {
    await setup({ shouldExecutionFail: true });

    userEvent.type(screen.getByLabelText("Size"), "42");
    userEvent.type(screen.getByLabelText("Color"), "metablue");
    userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Something's off")).toBeInTheDocument();
  });

  it("shows error if action fails", async () => {
    await setup({ shouldFetchFail: true });
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("immediately executes an action without parameters", async () => {
    const { executeActionEndpointSpy } = await setup({
      action: { ...TEST_ACTION, parameters: [] },
      expectedRequestBody: { parameters: {} },
    });

    expect(
      await screen.findByText("Thanks for your submission."),
    ).toBeInTheDocument();
    expect(screen.queryByText(TEST_ACTION.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(executeActionEndpointSpy.isDone()).toBe(true);
  });
});
