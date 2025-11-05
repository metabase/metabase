import { render, screen } from "__support__/ui";
import {
  MultiAutocompleteValue,
  type MultiAutocompleteValueProps,
} from "metabase/ui";

function setup(props: MultiAutocompleteValueProps) {
  render(<MultiAutocompleteValue {...props} />);
}

describe("MultiAutocompleteValue", () => {
  it("should render the value only when the label is not provided", () => {
    setup({ value: "value" });
    expect(screen.getByText("value")).toBeInTheDocument();
  });

  it("should render both the label and the value when the label is provided", () => {
    setup({ value: "value", label: "label" });
    expect(screen.getByText("label")).toBeInTheDocument();
    expect(screen.getByText("value")).toBeInTheDocument();
  });
});
