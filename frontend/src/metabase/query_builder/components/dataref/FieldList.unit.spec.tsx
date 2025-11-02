import { createMockMetadata } from "__support__/metadata";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { FieldList } from "./FieldList";

const database = createSampleDatabase();

const metadata = createMockMetadata({
  databases: [database],
});

function setup() {
  const fields = [Object.values(metadata.fields)[0]];
  renderWithProviders(<FieldList fields={fields} onFieldClick={jest.fn()} />);
  return { fields };
}

describe("FieldList", () => {
  it("should render the info icon", () => {
    setup();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });

  it("should render a copy button for each column", () => {
    setup();
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
    expect(getIcon("copy")).toBeInTheDocument();
  });
});
