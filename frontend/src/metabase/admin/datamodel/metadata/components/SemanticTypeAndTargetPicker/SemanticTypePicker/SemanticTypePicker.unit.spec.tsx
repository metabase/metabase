import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import type Field from "metabase-lib/v1/metadata/Field";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { FieldId, FieldReference } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";

import { SemanticTypePicker } from "./SemanticTypePicker";

const TEXT_FIELD = createMockField({
  id: getNextId(),
  display_name: "Text",
  base_type: "type/Text",
  effective_type: "type/Text",
});

const TEXT_LIKE_FIELD = createMockField({
  id: getNextId(),
  display_name: "TextLike",
  base_type: "type/PostgresEnum",
  effective_type: "type/PostgresEnum",
});

const NUMBER_FIELD = createMockField({
  id: getNextId(),
  display_name: "Number",
  base_type: "type/Integer",
  effective_type: "type/Integer",
});

const TEMPORAL_FIELD = createMockField({
  id: getNextId(),
  display_name: "Temporal",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
});

const BOOLEAN_FIELD = createMockField({
  id: getNextId(),
  display_name: "Boolean",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
});

const COLLECTION_FIELD = createMockField({
  id: getNextId(),
  display_name: "Collection",
  base_type: "type/Array",
  effective_type: "type/Array",
});

const STRUCTURED_FIELD = createMockField({
  id: getNextId(),
  display_name: "Structured",
  base_type: "type/Structured",
  effective_type: "type/Structured",
});

// type/JSON has 2 level-one data type ancestors (type/Collection and type/Structured)
const STRUCTURED_AND_COLLECTION_FIELD = createMockField({
  id: getNextId(),
  display_name: "Structured & Collection",
  base_type: "type/JSON",
  effective_type: "type/JSON",
});

interface SetupOpts {
  fieldId: FieldId | FieldReference;
  initialValue?: string | null;
}

interface TestComponentProps {
  initialValue?: string | null;
  field: Field;
}

function TestComponent({ field, initialValue = null }: TestComponentProps) {
  const [value, setValue] = useState<string | null>(initialValue);

  return <SemanticTypePicker field={field} value={value} onChange={setValue} />;
}

const setup = ({ fieldId, initialValue }: SetupOpts) => {
  const metadata = createMockMetadata({
    fields: [
      TEXT_FIELD,
      TEXT_LIKE_FIELD,
      BOOLEAN_FIELD,
      NUMBER_FIELD,
      TEMPORAL_FIELD,
      COLLECTION_FIELD,
      STRUCTURED_FIELD,
      STRUCTURED_AND_COLLECTION_FIELD,
    ],
  });
  const field = checkNotNull(metadata.field(fieldId));

  renderWithProviders(
    <TestComponent field={field} initialValue={initialValue} />,
  );
};

describe("SemanticTypePicker", () => {
  it("does not show deprecated semantic types", async () => {
    setup({ fieldId: TEMPORAL_FIELD.id });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });

  it("shows deprecated semantic type if it is already selected", async () => {
    setup({ fieldId: TEMPORAL_FIELD.id, initialValue: TYPE.CancelationDate });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.getByText("Cancelation date")).toBeInTheDocument();
  });

  it("hides deprecated semantic type after it is deselected", async () => {
    setup({ fieldId: TEMPORAL_FIELD.id, initialValue: TYPE.CancelationDate });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);
    const dropdown = within(screen.getByRole("listbox"));
    await userEvent.click(dropdown.getByText("Creation date"));
    await userEvent.click(picker);

    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });

  it("shows Category semantic type for boolean fields", async () => {
    setup({ fieldId: BOOLEAN_FIELD.id });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Category")).toBeInTheDocument();
  });
});
