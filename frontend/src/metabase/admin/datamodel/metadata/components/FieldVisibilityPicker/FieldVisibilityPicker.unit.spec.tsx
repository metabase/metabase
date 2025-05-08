import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { render, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { ORDERS, createSampleDatabase } from "metabase-types/api/mocks/presets";

import { FieldVisibilityPicker } from "./FieldVisibilityPicker";

const setup = () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });
  const field = checkNotNull(metadata.field(ORDERS.ID));

  render(<FieldVisibilityPicker field={field} onUpdateField={jest.fn()} />);
};

describe("FieldVisibilityPicker", () => {
  it("shows correct visibility descriptions (metabase#56077)", async () => {
    setup();

    const picker = screen.getByPlaceholderText("Select a field visibility");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));

    expect(
      dropdown.getByText(
        "The default setting. This field will be displayed normally in tables and charts.",
      ),
    ).toBeInTheDocument();
    expect(
      dropdown.getByText(
        "This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart.",
      ),
    ).toBeInTheDocument();
    expect(
      dropdown.getByText(
        "This field won't be visible or selectable in questions created with the GUI interfaces. It will still be accessible in SQL/native queries.",
      ),
    ).toBeInTheDocument();
  });
});
