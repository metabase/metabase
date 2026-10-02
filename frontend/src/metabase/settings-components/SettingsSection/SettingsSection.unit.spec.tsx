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
  switchDisabled?: boolean;
  note?: React.ReactNode;
};

const onChange = jest.fn();

const getSwitchSection = ({
  checked = false,
  switchDisabled,
  note,
}: SwitchSetupOptions = {}) => (
  <SwitchSettingsSection
    title="Group mapping"
    description="Assign people to groups automatically"
    note={note}
    checked={checked}
    switchDisabled={switchDisabled}
    onChange={onChange}
  >
    <div>Mapping editor</div>
  </SwitchSettingsSection>
);

const getSwitch = () => screen.getByRole("switch", { name: "Group mapping" });

describe("SwitchSettingsSection", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("puts the description and the note on the switch as its accessible description", () => {
    renderWithProviders(
      getSwitchSection({ note: "SCIM manages provisioning" }),
    );

    expect(
      screen.getByRole("heading", { name: "Group mapping" }),
    ).toBeInTheDocument();
    expect(getSwitch()).toHaveAccessibleDescription(
      /Assign people to groups automatically/,
    );
    expect(getSwitch()).toHaveAccessibleDescription(
      /SCIM manages provisioning/,
    );
  });

  it("locks the switch on its own without taking its focus away", async () => {
    const { rerender } = renderWithProviders(
      getSwitchSection({ checked: true, switchDisabled: true }),
    );
    const toggle = getSwitch();
    toggle.focus();

    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Mapping editor")).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(onChange).not.toHaveBeenCalled();
    expect(toggle).toHaveFocus();

    rerender(getSwitchSection({ checked: true, switchDisabled: false }));

    expect(toggle).not.toHaveAttribute("aria-disabled");
    expect(toggle).toHaveFocus();
  });

  it("keeps Enter from submitting the form the card sits in", async () => {
    const onSubmit = jest.fn((event: React.FormEvent) =>
      event.preventDefault(),
    );
    // Enter on a checkbox submits through the form's submit button, so the form needs one
    renderWithProviders(
      <form onSubmit={onSubmit}>
        {getSwitchSection()}
        <button type="submit">Save</button>
      </form>,
    );

    getSwitch().focus();
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
