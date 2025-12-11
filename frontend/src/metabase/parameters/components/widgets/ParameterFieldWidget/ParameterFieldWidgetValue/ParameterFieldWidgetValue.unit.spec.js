import { renderWithProviders, screen } from "__support__/ui";

import { ParameterFieldWidgetValue } from "./ParameterFieldWidgetValue";

const value = "A value";

describe("when fields is empty array", () => {
  it("renders value if it is a single item", () => {
    renderWithProviders(
      <ParameterFieldWidgetValue value={[value]} fields={[]} />,
    );
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  it("renders number of selections if multiple items", () => {
    renderWithProviders(
      <ParameterFieldWidgetValue value={[value, value]} fields={[]} />,
    );
    expect(screen.getByText("2 selections")).toBeInTheDocument();
  });
});
