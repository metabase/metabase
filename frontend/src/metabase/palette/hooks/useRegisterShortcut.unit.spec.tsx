import userEvent from "@testing-library/user-event";
import { type ActionImpl, type KBarQuery, useKBar } from "kbar";
import type { DependencyList } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import type { KeyboardShortcutId } from "../shortcuts";

import { trackKeyboardShortcutPerformed } from "./analytics";
import {
  type RegisterShortcutProps,
  useRegisterShortcut,
} from "./useRegisterShortcut";

jest.mock("./analytics");

type HarnessProps = {
  shortcutsToRegister: RegisterShortcutProps[];
  deps?: DependencyList;
};

const Harness = ({ shortcutsToRegister, deps }: HarnessProps) => {
  useRegisterShortcut(shortcutsToRegister, deps);
  return null;
};

type ProbeProps = {
  onQuery: (query: KBarQuery) => void;
  onActions: (actions: Record<string, ActionImpl>) => void;
};

// Renders before `Harness`, so `onQuery` sees the kbar query before any
// effect registers an action.
const ActionNames = ({ onQuery, onActions }: ProbeProps) => {
  const { query, actions } = useKBar((state) => ({ actions: state.actions }));
  onQuery(query);
  onActions(actions);

  return (
    <ul>
      {Object.values(actions).map((action) => (
        <li key={action.id}>{action.name}</li>
      ))}
    </ul>
  );
};

type SetupOpts = HarnessProps;

const setup = async ({ shortcutsToRegister, deps }: SetupOpts) => {
  let registerActions:
    | jest.SpiedFunction<KBarQuery["registerActions"]>
    | undefined;
  const onQuery = (query: KBarQuery) => {
    registerActions ??= jest.spyOn(query, "registerActions");
  };
  const registeredActions = new Map<string, ActionImpl>();
  const onActions = (actions: Record<string, ActionImpl>) => {
    Object.values(actions).forEach((action) =>
      registeredActions.set(action.id, action),
    );
  };

  const ui = (props: HarnessProps) => (
    <>
      <ActionNames onQuery={onQuery} onActions={onActions} />
      <Harness {...props} />
    </>
  );

  const { rerender } = renderWithProviders(ui({ shortcutsToRegister, deps }), {
    withKBar: true,
  });

  await screen.findByRole("list");

  return {
    rerender: (props: HarnessProps) => rerender(ui(props)),
    getRegisterActions: () => registerActions,
    getRegisteredAction: (id: string) => registeredActions.get(id),
  };
};

const toggleNavbar = (
  perform: RegisterShortcutProps["perform"],
  overrides: Partial<RegisterShortcutProps> = {},
): RegisterShortcutProps => ({ id: "toggle-navbar", perform, ...overrides });

const mockPerform = () =>
  jest.fn<void, Parameters<RegisterShortcutProps["perform"]>>();

// `[[` types one `[`, the key of the "toggle-navbar" shortcut.
const pressToggleNavbarKey = () => userEvent.keyboard("[[");

describe("useRegisterShortcut", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("runs the latest perform after a re-render", async () => {
    const firstPerform = mockPerform();
    const latestPerform = mockPerform();
    const { rerender, getRegisterActions } = await setup({
      shortcutsToRegister: [toggleNavbar(firstPerform)],
      deps: [],
    });

    rerender({ shortcutsToRegister: [toggleNavbar(latestPerform)], deps: [] });
    await pressToggleNavbarKey();

    expect(latestPerform).toHaveBeenCalledTimes(1);
    expect(firstPerform).not.toHaveBeenCalled();
    expect(getRegisterActions()).toHaveBeenCalledTimes(1);
  });

  it("registers again when the list of ids changes", async () => {
    const perform = mockPerform();
    const { rerender } = await setup({ shortcutsToRegister: [], deps: [] });
    expect(screen.queryByText("Toggle sidebar")).not.toBeInTheDocument();

    rerender({ shortcutsToRegister: [toggleNavbar(perform)], deps: [] });
    expect(await screen.findByText("Toggle sidebar")).toBeInTheDocument();
    await pressToggleNavbarKey();
    expect(perform).toHaveBeenCalledTimes(1);

    rerender({ shortcutsToRegister: [], deps: [] });
    expect(screen.queryByText("Toggle sidebar")).not.toBeInTheDocument();
  });

  it("registers again when a dep and the name change", async () => {
    const perform = mockPerform();
    const { rerender } = await setup({
      shortcutsToRegister: [toggleNavbar(perform, { name: "First name" })],
      deps: ["First name"],
    });
    expect(screen.getByText("First name")).toBeInTheDocument();

    rerender({
      shortcutsToRegister: [toggleNavbar(perform, { name: "Second name" })],
      deps: ["Second name"],
    });

    expect(await screen.findByText("Second name")).toBeInTheDocument();
    expect(screen.queryByText("First name")).not.toBeInTheDocument();
  });

  it("does not register again when only the name changes without a dep", async () => {
    const perform = mockPerform();
    const { rerender, getRegisterActions } = await setup({
      shortcutsToRegister: [toggleNavbar(perform, { name: "First name" })],
      deps: [],
    });

    rerender({
      shortcutsToRegister: [toggleNavbar(perform, { name: "Second name" })],
      deps: [],
    });

    expect(screen.getByText("First name")).toBeInTheDocument();
    expect(screen.queryByText("Second name")).not.toBeInTheDocument();
    expect(getRegisterActions()).toHaveBeenCalledTimes(1);
  });

  it("runs the perform of the last entry when an id repeats", async () => {
    const firstPerform = mockPerform();
    const lastPerform = mockPerform();
    await setup({
      shortcutsToRegister: [
        toggleNavbar(firstPerform),
        toggleNavbar(lastPerform),
      ],
    });

    await pressToggleNavbarKey();

    expect(lastPerform).toHaveBeenCalledTimes(1);
    expect(firstPerform).not.toHaveBeenCalled();
  });

  it("tracks a shortcut that runs from the keyboard", async () => {
    const perform = mockPerform();
    await setup({ shortcutsToRegister: [toggleNavbar(perform)] });

    await pressToggleNavbarKey();

    expect(perform).toHaveBeenCalledTimes(1);
    expect(trackKeyboardShortcutPerformed).toHaveBeenCalledTimes(1);
    expect(trackKeyboardShortcutPerformed).toHaveBeenCalledWith(
      "toggle-navbar",
    );
  });

  it("does not track a key press when the latest render dropped the id", async () => {
    const perform = mockPerform();
    const { rerender, getRegisteredAction } = await setup({
      shortcutsToRegister: [toggleNavbar(perform)],
    });
    // kbar can still hold this action after a render drops its id, until the
    // effect cleanup unregisters it.
    const staleAction = getRegisteredAction("toggle-navbar");
    expect(staleAction).toBeDefined();

    rerender({ shortcutsToRegister: [] });
    staleAction?.command?.perform(new KeyboardEvent("keydown"));

    expect(perform).not.toHaveBeenCalled();
    expect(trackKeyboardShortcutPerformed).not.toHaveBeenCalled();
  });

  it("does not throw without a kbar provider", () => {
    const perform = mockPerform();

    expect(() =>
      renderWithProviders(
        <Harness shortcutsToRegister={[toggleNavbar(perform)]} />,
      ),
    ).not.toThrow();
  });

  it("throws for an unknown id without a shortcut", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    // The type rules out unknown ids. The cast reaches the runtime check
    // that protects untyped callers.
    const id = "unknown-shortcut" as KeyboardShortcutId;

    expect(() =>
      renderWithProviders(
        <Harness shortcutsToRegister={[{ id, perform: mockPerform() }]} />,
        { withKBar: true },
      ),
    ).toThrow("Unrecognized shortcut id unknown-shortcut");
  });
});
