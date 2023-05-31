import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreferencesStep, { PreferencesStepProps } from "./PreferencesStep";

describe("PreferencesStep", () => {
  it("should render in inactive state", () => {
    const props = getProps({
      isStepActive: false,
    });

    render(<PreferencesStep {...props} />);

    expect(screen.getByText("Usage data preferences")).toBeInTheDocument();
  });

  it("should allow toggling tracking permissions", () => {
    const props = getProps({
      isTrackingAllowed: false,
      isStepActive: true,
    });

    render(<PreferencesStep {...props} />);
    userEvent.click(screen.getByLabelText(/Allow Metabase/));

    expect(props.onTrackingChange).toHaveBeenCalledWith(true);
  });

  it("should show an error message on submit", async () => {
    const props = getProps({
      isTrackingAllowed: true,
      isStepActive: true,
      onStepSubmit: jest.fn().mockRejectedValue({}),
    });

    render(<PreferencesStep {...props} />);
    userEvent.click(screen.getByText("Finish"));

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<PreferencesStepProps>,
): PreferencesStepProps => ({
  isTrackingAllowed: false,
  isStepActive: false,
  isStepCompleted: false,
  isSetupCompleted: false,
  onTrackingChange: jest.fn(),
  onStepSelect: jest.fn(),
  onStepSubmit: jest.fn(),
  ...opts,
});
