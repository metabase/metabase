import { render, screen } from "@testing-library/react";
import WelcomePage, { WelcomePageProps } from "./WelcomePage";

describe("WelcomePage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should not render until the locale is loaded", () => {
    const props = getProps({ isLocaleLoaded: false });

    render(<WelcomePage {...props} />);

    expect(screen.queryByText("Welcome to Metabase")).not.toBeInTheDocument();
  });

  it("should render after some time even if the locale is not loaded", () => {
    const oldProps = getProps({ isLocaleLoaded: false });
    const newProps = getProps({ isLocaleLoaded: false });

    const { rerender } = render(<WelcomePage {...oldProps} />);
    jest.advanceTimersByTime(310);
    rerender(<WelcomePage {...newProps} />);

    expect(screen.getByText("Welcome to Metabase")).toBeInTheDocument();
  });

  it("should render before the timeout if the locale is loaded", () => {
    const oldProps = getProps({ isLocaleLoaded: false });
    const newProps = getProps({ isLocaleLoaded: true });

    const { rerender } = render(<WelcomePage {...oldProps} />);
    rerender(<WelcomePage {...newProps} />);

    expect(screen.getByText("Welcome to Metabase")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<WelcomePageProps>): WelcomePageProps => ({
  isLocaleLoaded: false,
  onStepShow: jest.fn(),
  onStepSubmit: jest.fn(),
  ...opts,
});
