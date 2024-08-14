import { render, screen, within } from "__support__/ui";

import { ParametersPopover } from "./ParametersPopover";

const options = [
  {
    title: "Time",
    subtitle: "Date range, relative date, time of day, etc.",
    icon: "calendar",
  },
  {
    title: "Location",
    subtitle: "City, State, Country, ZIP code.",
    icon: "location",
  },
  {
    title: "ID",
    subtitle: "User ID, Product ID, Event ID, etc.",
    icon: "label",
  },
  {
    title: "Number",
    subtitle: "Subtotal, Age, Price, Quantity, etc.",
    icon: "number",
  },
  {
    title: "Text or Category",
    subtitle: "Name, Rating, Description, etc.",
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
