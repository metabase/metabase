import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { getIsNavigationPending } from "metabase/router";

import type { ChangeOptions, TreePath } from "./types";
import { RouterTablePicker } from "./wrappers";

const navigate = jest.fn();

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  useNavigate: () => navigate,
  getIsNavigationPending: jest.fn(() => false),
}));

const PICKED: TreePath = { databaseId: 1, schemaName: "PUBLIC" };

jest.mock("./components", () => ({
  TablePicker: ({
    onChange,
  }: {
    onChange: (path: TreePath, options?: ChangeOptions) => void;
  }) => (
    <>
      <button onClick={() => onChange(PICKED, { isAutomatic: true })}>
        automatic
      </button>
      <button onClick={() => onChange(PICKED)}>manual</button>
    </>
  ),
}));

function setup() {
  render(<RouterTablePicker params={{}} setOnUpdateCallback={jest.fn()} />);
}

describe("RouterTablePicker", () => {
  beforeEach(() => {
    navigate.mockClear();
    jest.mocked(getIsNavigationPending).mockReturnValue(false);
  });

  it("mirrors an automatic selection into the URL", async () => {
    setup();

    await userEvent.click(screen.getByText("automatic"));

    expect(navigate).toHaveBeenCalledWith(
      "/data-studio/data/database/1/schema/1:PUBLIC",
      {
        replace: true,
      },
    );
  });

  // The tree selects a lone database, and then its lone schema, once its data
  // arrives, which can be long after the user asked to go somewhere else. A
  // `route.lazy` destination keeps this page mounted until its chunk resolves,
  // so this replace would take the pending navigation's place and strand the
  // user here. See glossary.cy.spec.ts, which caught it.
  it("skips an automatic selection while a navigation is pending", async () => {
    jest.mocked(getIsNavigationPending).mockReturnValue(true);
    setup();

    await userEvent.click(screen.getByText("automatic"));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("still follows a selection the user made", async () => {
    jest.mocked(getIsNavigationPending).mockReturnValue(true);
    setup();

    await userEvent.click(screen.getByText("manual"));

    expect(navigate).toHaveBeenCalledWith(
      "/data-studio/data/database/1/schema/1:PUBLIC",
      {
        replace: true,
      },
    );
  });
});
