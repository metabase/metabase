import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { PathCleaningWidget } from "./PathCleaningWidget";
import {
  type PathCleaningRule,
  getDefaultPathCleaningRules,
} from "./path-cleaning";

const QUERY_STRING_RULE: PathCleaningRule = {
  pattern: "[?#].*$",
  replacement: "",
};

type SetupOpts = {
  value?: PathCleaningRule[];
};

const setup = ({ value = [QUERY_STRING_RULE] }: SetupOpts = {}) => {
  const onChange = jest.fn<void, [PathCleaningRule[]]>();
  renderWithProviders(
    <>
      <PathCleaningWidget
        id="path_cleaning"
        value={value}
        onChange={onChange}
      />
      <button>Outside</button>
    </>,
  );
  return { onChange };
};

const getLastPattern = () =>
  checkNotNull(screen.getAllByLabelText("Pattern").at(-1));
const getLastReplacement = () =>
  checkNotNull(screen.getAllByLabelText("Replacement").at(-1));

/** Saves like Data Studio, with a reset to the defaults and its undo. */
const ResettableWidget = () => {
  const [rules, setRules] = useState([QUERY_STRING_RULE]);
  const [rulesBeforeReset, setRulesBeforeReset] = useState(rules);
  return (
    <>
      <PathCleaningWidget
        id="path_cleaning"
        value={rules}
        onChange={setRules}
      />
      <button
        onClick={() => {
          setRulesBeforeReset(rules);
          setRules(getDefaultPathCleaningRules());
        }}
      >
        Reset
      </button>
      <button onClick={() => setRules(rulesBeforeReset)}>Undo</button>
    </>
  );
};

describe("PathCleaningWidget", () => {
  it("saves a new rule when the focus leaves the list", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Add a rule/ }));
    // `[[` types a literal `[`.
    await userEvent.type(getLastPattern(), "/[[0-9]+");
    await userEvent.click(getLastReplacement());
    await userEvent.type(getLastReplacement(), "/:id");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      QUERY_STRING_RULE,
      { pattern: "/[0-9]+", replacement: "/:id" },
    ]);
  });

  it("asks for a pattern before saving a rule", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Add a rule/ }));
    await userEvent.type(getLastReplacement(), "/:id");
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByText("Enter a pattern")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves a rule's description", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Description" }));
    await userEvent.type(
      await screen.findByLabelText("Rule description"),
      "Drops tracking parameters",
    );
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    expect(onChange).toHaveBeenCalledWith([
      { ...QUERY_STRING_RULE, description: "Drops tracking parameters" },
    ]);
  });

  it("shows the default rules' descriptions", async () => {
    setup({ value: getDefaultPathCleaningRules() });

    await userEvent.click(
      screen.getAllByRole("button", { name: "Description" })[2],
    );

    expect(await screen.findByLabelText("Rule description")).toHaveValue(
      "Replaces numbers with :id, as in /dashboard/123.",
    );
  });

  it("previews a description on hover", async () => {
    setup({ value: getDefaultPathCleaningRules() });
    const button = checkNotNull(
      screen.getAllByRole("button", { name: "Description" }).at(2),
    );

    await userEvent.hover(button);
    expect(
      await screen.findByText(
        "Replaces numbers with :id, as in /dashboard/123.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Rule description")).not.toBeInTheDocument();

    await userEvent.unhover(button);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Edit description" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("edits a description from its preview", async () => {
    setup({ value: getDefaultPathCleaningRules() });

    await userEvent.hover(
      checkNotNull(
        screen.getAllByRole("button", { name: "Description" }).at(2),
      ),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit description" }),
    );

    expect(await screen.findByLabelText("Rule description")).toHaveValue(
      "Replaces numbers with :id, as in /dashboard/123.",
    );
  });

  it("offers to add a description on hover", async () => {
    setup();

    await userEvent.hover(screen.getByRole("button", { name: "Description" }));

    expect(
      await screen.findByRole("button", { name: "Add a description" }),
    ).toBeInTheDocument();
  });

  it("leaves out a blank rule", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Add a rule/ }));
    await userEvent.click(getLastPattern());
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a rule", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Remove rule" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows saved rules again after a reset is undone", async () => {
    renderWithProviders(<ResettableWidget />);

    await userEvent.clear(getLastReplacement());
    await userEvent.type(getLastReplacement(), "/");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getAllByLabelText("Pattern")).toHaveLength(
      getDefaultPathCleaningRules().length,
    );

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByLabelText("Pattern")).toHaveLength(1);
    expect(getLastReplacement()).toHaveValue("/");
  });
});
