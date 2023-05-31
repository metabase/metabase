import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LighthouseToggleWidget from "./LighthouseToggleWidget";
import { LighthouseSetting } from "./types";

const TOGGLE_LABEL = "Show this on the home and login pages";

describe("LighthouseToggleWidget", () => {
  it("should disable the illustration", () => {
    const setting = getSetting();
    const onChange = jest.fn();

    render(<LighthouseToggleWidget setting={setting} onChange={onChange} />);
    userEvent.click(screen.getByText(TOGGLE_LABEL));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("should enable the illustration", () => {
    const setting = getSetting({ value: false });
    const onChange = jest.fn();

    render(<LighthouseToggleWidget setting={setting} onChange={onChange} />);
    userEvent.click(screen.getByText(TOGGLE_LABEL));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});

const getSetting = (opts?: Partial<LighthouseSetting>): LighthouseSetting => ({
  value: null,
  default: true,
  ...opts,
});
