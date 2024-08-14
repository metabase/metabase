import { render, screen, within } from "__support__/ui";

import { ParametersPopover } from "./ParametersPopover";

const options = [
  {
    title: "Date picker",
    subtitle: "Date range, specific date…",
    icon: "calendar",
  },
  {
    title: "Time grouping",
    subtitle: "Day, week, month, year…",
    icon: "clock",
  },
  {
    title: "Location",
    subtitle: "Country, State, Postal Code…",
    icon: "location",
  },
  {
    title: "Text or Category",
    subtitle: "Contains, is, starts with…",
    icon: "label",
  },
  {
    title: "Number",
    subtitle: "Between, greater than…",
    icon: "number",
  },
  {
    title: "ID",
    subtitle: "Primary key, User ID…",
    icon: "label",
  },
];

describe("ParameterPopover", () => {
  it.each(options)(
    "should render '$title' option with icon '$icon'",
    ({ title, subtitle, icon }) => {
      render(
        <ParametersPopover onClose={jest.fn()} onAddParameter={jest.fn()} />,
      );

      expect(screen.getByText(title)).toBeInTheDocument();

      const section = screen.getByText(title).parentElement as HTMLElement;

      expect(within(section).getByText(subtitle)).toBeInTheDocument();
      expect(
        within(section).getByLabelText(`${icon} icon`),
      ).toBeInTheDocument();
    },
  );
});
