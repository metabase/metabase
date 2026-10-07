import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { SwitchSettingsSection } from "./SwitchSettingsSection";

type SetupOptions = {
  checked?: boolean;
  switchDisabled?: boolean;
  note?: React.ReactNode;
};

const onChange = jest.fn();

const getSection = ({
  checked = false,
  switchDisabled,
  note,
}: SetupOptions = {}) => (
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
    renderWithProviders(getSection({ note: "SCIM manages provisioning" }));

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
      getSection({ checked: true, switchDisabled: true }),
    );
    const toggle = getSwitch();
    toggle.focus();

    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Mapping editor")).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(onChange).not.toHaveBeenCalled();
    expect(toggle).toHaveFocus();

    rerender(getSection({ checked: true, switchDisabled: false }));

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
        {getSection()}
        <button type="submit">Save</button>
      </form>,
    );

    getSwitch().focus();
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
