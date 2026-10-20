import userEvent from "@testing-library/user-event";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";

import type { PathStep } from "../../path-steps/rows";
import type { PathSteps } from "../../path-steps/use-path-steps";

import { PathStepsPanel } from "./PathStepsPanel";

const PRICING: PathStep = {
  name: "/pricing",
  entrances: 10,
  bounces: 2,
  visits: 40,
  exits: 10,
};

const SIGNUP: PathStep = {
  name: "signup",
  entrances: 0,
  bounces: 0,
  visits: 12,
  exits: 12,
};

type SetupOpts = Partial<PathSteps>;

const setup = (opts: SetupOpts = {}) => {
  mockGetBoundingClientRect({ width: 800, height: 40 });
  renderWithProviders(
    <PathStepsPanel
      steps={{
        steps: [PRICING, SIGNUP],
        showsEntrances: true,
        showsBounces: true,
        showsExits: true,
        isLoading: false,
        error: undefined,
        warnings: [],
        ...opts,
      }}
    />,
  );
};

const getCellTexts = () =>
  screen
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .queryAllByRole("gridcell")
        .map((cell) => cell.textContent),
    )
    .filter((cells) => cells.length > 0);

describe("PathStepsPanel", () => {
  it("shows each step's entrances, bounce rate, visits and exit rate", () => {
    setup();

    ["Step", "Entrances", "Bounce rate", "Visits", "Exit rate"].forEach(
      (name) =>
        expect(screen.getByRole("columnheader", { name })).toBeInTheDocument(),
    );
    expect(getCellTexts()).toEqual([
      ["/pricing", "10", "20%", "40", "25%"],
      ["signup", "0", "—", "12", "100%"],
    ]);
  });

  it("explains a rate with its counts", async () => {
    setup({ steps: [PRICING] });

    await userEvent.hover(screen.getByText("20%"));

    expect(
      await screen.findByText(
        "2 of 10 visits that started here had no other step",
      ),
    ).toBeInTheDocument();
  });

  it("hides entrances and bounces when the paths start at an event", () => {
    setup({ steps: [PRICING], showsEntrances: false, showsBounces: false });

    expect(
      screen.queryByRole("columnheader", { name: "Entrances" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Bounce rate" }),
    ).not.toBeInTheDocument();
    expect(getCellTexts()).toEqual([["/pricing", "40", "25%"]]);
  });

  it("keeps entrances but hides bounces when the paths require an event", () => {
    setup({ steps: [PRICING], showsBounces: false });

    expect(
      screen.queryByRole("columnheader", { name: "Bounce rate" }),
    ).not.toBeInTheDocument();
    expect(getCellTexts()).toEqual([["/pricing", "10", "40", "25%"]]);
  });

  it("hides the exit rate when the paths end at an event", () => {
    setup({ steps: [PRICING], showsExits: false });

    expect(
      screen.queryByRole("columnheader", { name: "Exit rate" }),
    ).not.toBeInTheDocument();
    expect(getCellTexts()).toEqual([["/pricing", "10", "20%", "40"]]);
  });

  it("says when there are no visits", () => {
    setup({ steps: [] });

    expect(screen.getByText("No visits in this range.")).toBeInTheDocument();
  });
});
