import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDagTransformsEndpoint,
  setupListTransformTagsEndpoint,
  setupRunTransformDagEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Transform } from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks";

import { RunSection } from "./RunSection";

const TRANSFORM_ID = 10;

function setup({ transform }: { transform?: Transform } = {}) {
  const testTransform =
    transform ?? createMockTransform({ id: TRANSFORM_ID, last_run: null });

  setupListTransformTagsEndpoint([]);
  setupListDagTransformsEndpoint(TRANSFORM_ID, [
    { id: 1, name: "Upstream A" },
    { id: 2, name: "Upstream B" },
    { id: TRANSFORM_ID, name: testTransform.name },
  ]);
  setupRunTransformDagEndpoint(TRANSFORM_ID);

  renderWithProviders(<RunSection transform={testTransform} />);
}

describe("RunSection DAG run flow", () => {
  it("offers upstream and downstream run options", async () => {
    setup();
    await userEvent.click(screen.getByTestId("run-options-button"));

    expect(
      await screen.findByText("Run this and all upstream transforms"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Run this and all downstream transforms"),
    ).toBeInTheDocument();
  });

  it("previews the transforms and triggers a run-dag with the chosen direction", async () => {
    setup();
    await userEvent.click(screen.getByTestId("run-options-button"));
    await userEvent.click(
      await screen.findByText("Run this and all upstream transforms"),
    );

    // The modal shows the ordered plan fetched from /dag-transforms
    expect(
      await screen.findByText("Run this and all upstream transforms?"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Upstream A")).toBeInTheDocument();
    expect(screen.getByText("Upstream B")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run all" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/transform/${TRANSFORM_ID}/run-dag`,
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/transform/${TRANSFORM_ID}/run-dag`,
    );
    const body = JSON.parse((call?.options?.body as string) ?? "{}");
    expect(body.direction).toBe("upstream");
  });
});
