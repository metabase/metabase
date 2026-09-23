import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { useRankExplorationsMutation } from "metabase/api/jev";

import { JevExplorations } from "./JevExplorations";

jest.mock("metabase/api/jev", () => ({
  useRankExplorationsMutation: jest.fn(),
}));

const candidates = [
  {
    title: "Closed At",
    description: "Explore closure time",
    kind: "drilldown-fields",
    url: "/auto/dashboard/field/42",
  },
];
const report = {
  request_id: "test",
  status: "ok",
  selected: ["action_0", "invented"],
  ranked: [
    {
      id: "action_0",
      title: "Closed At",
      kind: "drilldown-fields",
      score: 2.5,
    },
  ],
  elapsed_ms: 123,
  usage: { input_tokens: 200, output_tokens: 20 },
};

function Harness() {
  const [context, setContext] = useState("Issues");
  return (
    <>
      <button onClick={() => setContext("Orders")}>Change context</button>
      <JevExplorations candidates={candidates} context={context} />
    </>
  );
}

function setup(unwrap: () => Promise<unknown>) {
  const abort = jest.fn();
  const rank = jest.fn().mockReturnValue({ unwrap, abort });
  jest
    .mocked(useRankExplorationsMutation)
    // This component consumes only the trigger; RTK mutation state is unused.
    .mockReturnValue([rank, {}] as ReturnType<
      typeof useRankExplorationsMutation
    >);
  const view = renderWithProviders(<Harness />, { withRouter: true });
  return { ...view, rank, abort };
}

it("uses existing action URLs, discards invented IDs, and reports actual usage", async () => {
  const { rank } = setup(async () => report);
  const link = await screen.findByRole("link", { name: /Closed At/ });
  expect(link).toHaveAttribute("href", "/auto/dashboard/field/42");
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByText("200 input + 20 output tokens")).toBeInTheDocument();
  expect(rank.mock.calls[0][0].candidates[0]).not.toHaveProperty("url");
});

it("offers the normal X-ray fallback when ranking fails", async () => {
  setup(async () => {
    throw new Error("offline");
  });
  expect(
    await screen.findByText(
      "JEV is unavailable. More X-rays are listed below.",
    ),
  ).toBeInTheDocument();
});

it("does not display a late response after context changes", async () => {
  let resolve!: (value: unknown) => void;
  const { rank } = setup(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  rank.mockReturnValue({
    unwrap: () => new Promise(() => {}),
    abort: jest.fn(),
  });
  await userEvent.click(screen.getByRole("button", { name: "Change context" }));
  resolve(report);
  await waitFor(() => expect(rank).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText("Choosing explorations…")).toBeInTheDocument();
});
