import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import {
  CollapsibleSettingsSection,
  SwitchSettingsSection,
} from "./SettingsSection";

type SetupOptions = { defaultOpened?: boolean; disabled?: boolean };

const getSection = ({ defaultOpened, disabled }: SetupOptions = {}) => (
  <CollapsibleSettingsSection
    title="Section title"
    description="Section description"
    defaultOpened={defaultOpened}
    disabled={disabled}
  >
    <div>Section content</div>
  </CollapsibleSettingsSection>
);

const setup = (options: SetupOptions = {}) =>
  renderWithProviders(getSection(options));

describe("CollapsibleSettingsSection", () => {
  it("shows the title and description while collapsed", () => {
    setup();

    expect(screen.getByText("Section title")).toBeInTheDocument();
    expect(screen.getByText("Section description")).toBeInTheDocument();
    expect(screen.getByText("Section content")).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: /Section title/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("exposes the title as a heading and keeps the chevron out of the accessible name", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "Section title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Section title" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("expands and collapses on header click", async () => {
    setup();
    const header = screen.getByRole("button", { name: /Section title/ });

    await userEvent.click(header);
    await waitFor(() =>
      expect(screen.getByText("Section content")).toBeVisible(),
    );
    expect(header).toHaveAttribute("aria-expanded", "true");

    // jsdom never completes the closing transition, so assert state via aria
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("can start expanded via defaultOpened", () => {
    setup({ defaultOpened: true });

    expect(screen.getByText("Section content")).toBeVisible();
  });

  it("stays collapsed while disabled and opens once enabled when defaultOpened", async () => {
    const { rerender } = setup({ defaultOpened: true, disabled: true });
    const header = screen.getByRole("button", { name: /Section title/ });

    expect(header).toBeDisabled();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Section content")).not.toBeVisible();

    rerender(getSection({ defaultOpened: true, disabled: false }));

    expect(header).toBeEnabled();
    expect(header).toHaveAttribute("aria-expanded", "true");
    await waitFor(() =>
      expect(screen.getByText("Section content")).toBeVisible(),
    );
  });
});

type SwitchSetupOptions = {
  checked?: boolean;
  disabled?: boolean;
  switchDisabled?: boolean;
  switchBusy?: boolean;
  note?: React.ReactNode;
};

const getSwitchSection = ({
  checked = false,
  disabled,
  switchDisabled,
  switchBusy,
  note,
}: SwitchSetupOptions = {}) => {
  const onChange = jest.fn();
  const element = (
    <SwitchSettingsSection
      title="Group mapping"
      description="Assign people to groups automatically"
      note={note}
      checked={checked}
      disabled={disabled}
      switchDisabled={switchDisabled}
      switchBusy={switchBusy}
      onChange={onChange}
    >
      <div>Mapping editor</div>
    </SwitchSettingsSection>
  );
  return { element, onChange };
};

const setupSwitch = (options: SwitchSetupOptions = {}) => {
  const { element, onChange } = getSwitchSection(options);
  renderWithProviders(element);
  return { onChange };
};

const getSwitch = () => screen.getByRole("switch", { name: "Group mapping" });

describe("SwitchSettingsSection", () => {
  it("wires the title to the switch as its label", () => {
    setupSwitch();

    expect(
      screen.getByRole("heading", { name: "Group mapping" }),
    ).toBeInTheDocument();
    expect(getSwitch()).not.toBeChecked();
  });

  it("puts the description on the switch as its accessible description", () => {
    setupSwitch();

    expect(getSwitch()).toHaveAccessibleDescription(
      /Assign people to groups automatically/,
    );
  });

  it("reveals the children only while checked", () => {
    setupSwitch({ checked: true });

    expect(screen.getByText("Mapping editor")).toBeInTheDocument();
  });

  it("hides the children while unchecked", () => {
    setupSwitch();

    expect(screen.queryByText("Mapping editor")).not.toBeInTheDocument();
  });

  it("hides the children and locks the switch while the card is disabled", () => {
    setupSwitch({ checked: true, disabled: true });

    expect(screen.queryByText("Mapping editor")).not.toBeInTheDocument();
    expect(getSwitch()).toBeDisabled();
  });

  it("locks the switch on its own when something else owns the value", () => {
    setupSwitch({ checked: true, switchDisabled: true });

    expect(getSwitch()).toBeDisabled();
    // the card is not dimmed, so the mappings stay readable
    expect(screen.getByText("Mapping editor")).toBeInTheDocument();
  });

  // disabling a focused switch blurs it, so a write holds it with aria-disabled instead
  it("holds the switch during a write without taking its focus away", async () => {
    const { onChange } = setupSwitch({ switchBusy: true });
    const toggle = getSwitch();
    toggle.focus();

    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).toHaveFocus();

    await userEvent.click(toggle);

    expect(onChange).not.toHaveBeenCalled();
    expect(toggle).toHaveFocus();
  });

  it("takes the switch back once the write finishes", () => {
    setupSwitch();

    expect(getSwitch()).not.toHaveAttribute("aria-disabled");
  });

  it("reports the clicked value", async () => {
    const { onChange } = setupSwitch();

    await userEvent.click(getSwitch());

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders a note next to the description", () => {
    setupSwitch({ note: "Using MB_LDAP_GROUP_SYNC" });

    expect(getSwitch()).toHaveAccessibleDescription(/Using MB_LDAP_GROUP_SYNC/);
  });

  // a caller building its note with `cond && <Note/>` passes `false` when the condition is off
  it("keeps the switch usable when the note is false", async () => {
    const { onChange } = setupSwitch({ note: false });

    expect(getSwitch()).toBeEnabled();
    await userEvent.click(getSwitch());

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("keeps Enter from submitting the form the card sits in", async () => {
    const onSubmit = jest.fn();
    const { element } = getSwitchSection();
    renderWithProviders(<form onSubmit={onSubmit}>{element}</form>);

    getSwitch().focus();
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
