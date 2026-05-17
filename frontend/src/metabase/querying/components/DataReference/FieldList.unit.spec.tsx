import { createMockMetadata } from "__support__/metadata";
import { render, screen } from "__support__/ui-minimal";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { FieldList } from "./FieldList";

const database = createSampleDatabase();

const metadata = createMockMetadata({
  databases: [database],
});

function setup() {
  const fields = [Object.values(metadata.fields)[0]];
  render(<FieldList fields={fields} onFieldClick={jest.fn()} />);
}

describe("FieldList", () => {
  it("should render the info icon", () => {
    setup();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });
});
