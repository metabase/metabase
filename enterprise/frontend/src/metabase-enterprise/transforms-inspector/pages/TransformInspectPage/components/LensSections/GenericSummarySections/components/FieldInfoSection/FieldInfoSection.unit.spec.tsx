import { render, screen } from "__support__/ui-minimal";

import { FieldInfoSection } from "./FieldInfoSection";

function setup() {
  render(
    <FieldInfoSection
      sources={[]}
      target={{
        table_id: 1,
        table_name: "Output table",
        column_count: 0,
        fields: [],
      }}
    />,
  );
}

describe("FieldInfoSection", () => {
  it("shows warning when sources are empty", () => {
    setup();

    expect(screen.getByText("Missing input data")).toBeInTheDocument();
  });
});
