import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import type Field from "metabase-lib/v1/metadata/Field";
import { TYPE } from "metabase-lib/v1/types/constants";
import type {
  Field as ApiField,
  FieldId,
  FieldReference,
} from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";

import { SemanticTypePicker } from "./SemanticTypePicker";

const TEXT_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Text",
  base_type: "type/Text",
  effective_type: "type/Text",
});

const TEXT_LIKE_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/TextLike",
  base_type: "type/PostgresEnum",
  effective_type: "type/PostgresEnum",
});

const NUMBER_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Number",
  base_type: "type/Integer",
  effective_type: "type/Integer",
});

const TEMPORAL_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Temporal",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
});

const BOOLEAN_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Boolean",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
});

const COLLECTION_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Collection",
  base_type: "type/Array",
  effective_type: "type/Array",
});

const STRUCTURED_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Structured",
  base_type: "type/Structured",
  effective_type: "type/Structured",
});

// type/JSON has 2 level-one data type ancestors (type/Collection and type/Structured)
const STRUCTURED_AND_COLLECTION_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Structured and type/Collection",
  base_type: "type/JSON",
  effective_type: "type/JSON",
});

const FIELDS = [
  TEXT_FIELD,
  TEXT_LIKE_FIELD,
  BOOLEAN_FIELD,
  NUMBER_FIELD,
  TEMPORAL_FIELD,
  COLLECTION_FIELD,
  STRUCTURED_FIELD,
  STRUCTURED_AND_COLLECTION_FIELD,
];

interface SetupOpts {
  fields?: ApiField[];
  fieldId: FieldId | FieldReference;
  initialValue: string | null;
}

interface TestComponentProps {
  initialValue: string | null;
  field: Field;
}

function TestComponent({ field, initialValue }: TestComponentProps) {
  const [value, setValue] = useState<string | null>(initialValue);

  return <SemanticTypePicker field={field} value={value} onChange={setValue} />;
}

const setup = ({ fields = FIELDS, fieldId, initialValue }: SetupOpts) => {
  const metadata = createMockMetadata({ fields });
  const field = checkNotNull(metadata.field(fieldId));

  renderWithProviders(
    <TestComponent field={field} initialValue={initialValue} />,
  );
};

describe("SemanticTypePicker", () => {
  it("does not show deprecated semantic types", async () => {
    setup({
      fieldId: TEMPORAL_FIELD.id,
      initialValue: null,
    });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });

  it("shows deprecated semantic type if it is already selected", async () => {
    setup({
      fieldId: TEMPORAL_FIELD.id,
      initialValue: TYPE.CancelationDate,
    });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.getByText("Cancelation date")).toBeInTheDocument();
  });

  it("hides deprecated semantic type after it is deselected", async () => {
    setup({
      fieldId: TEMPORAL_FIELD.id,
      initialValue: TYPE.CancelationDate,
    });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);
    const dropdown = within(screen.getByRole("listbox"));
    await userEvent.click(dropdown.getByText("Creation date"));
    await userEvent.click(picker);

    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });

  it("shows Category semantic type for boolean field's", async () => {
    setup({
      fieldId: BOOLEAN_FIELD.id,
      initialValue: null,
    });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Category")).toBeInTheDocument();
  });

  describe("Entity Key, Foreign Key, and No semantic type", () => {
    it.each(FIELDS)(
      "shows Entity Key, Foreign Key, and No semantic type when field's effective type is derived from $display_name",
      async field => {
        setup({
          fieldId: field.id,
          initialValue: null,
        });

        const picker = screen.getByPlaceholderText("Select a semantic type");
        await userEvent.click(picker);

        const dropdown = within(screen.getByRole("listbox"));
        expect(dropdown.getByText("Entity Key")).toBeInTheDocument();
        expect(dropdown.getByText("Foreign Key")).toBeInTheDocument();
        expect(dropdown.getByText("No semantic type")).toBeInTheDocument();
      },
    );
  });

  describe("Entity Name", () => {
    it("shows Entity Name when field's effective type is derived from text/Type", async () => {
      setup({
        fieldId: TEXT_FIELD.id,
        initialValue: null,
      });

      const picker = screen.getByPlaceholderText("Select a semantic type");
      await userEvent.click(picker);

      const dropdown = within(screen.getByRole("listbox"));
      expect(dropdown.getByText("Entity Name")).toBeInTheDocument();
    });

    it.each([
      TEXT_LIKE_FIELD,
      BOOLEAN_FIELD,
      NUMBER_FIELD,
      TEMPORAL_FIELD,
      COLLECTION_FIELD,
      STRUCTURED_FIELD,
      STRUCTURED_AND_COLLECTION_FIELD,
    ])(
      "does not show Entity Name when field's effective type is derived from $display_name",
      async field => {
        setup({
          fieldId: field.id,
          initialValue: null,
        });

        const picker = screen.getByPlaceholderText("Select a semantic type");
        await userEvent.click(picker);

        const dropdown = within(screen.getByRole("listbox"));
        expect(dropdown.queryByText("Entity Name")).not.toBeInTheDocument();
      },
    );
  });

  describe("hack: allow casting text types to numerical types", () => {
    it.each([TEXT_FIELD, TEXT_LIKE_FIELD])(
      "also shows semantic types derived from text/Number when field's effective type is derived from $display_name",
      async field => {
        setup({
          fieldId: field.id,
          initialValue: null,
        });

        const picker = screen.getByPlaceholderText("Select a semantic type");
        await userEvent.click(picker);

        const dropdown = within(screen.getByRole("listbox"));
        expect(dropdown.getByText("Latitude")).toBeInTheDocument();
        expect(dropdown.getByText("Longitude")).toBeInTheDocument();
        expect(dropdown.getByText("Currency")).toBeInTheDocument();
        expect(dropdown.getByText("Discount")).toBeInTheDocument();
        expect(dropdown.getByText("Income")).toBeInTheDocument();
        expect(dropdown.getByText("Quantity")).toBeInTheDocument();
        expect(dropdown.getByText("Score")).toBeInTheDocument();
        expect(dropdown.getByText("Percentage")).toBeInTheDocument();
      },
    );
  });

  it("uses field's effective_type when it is available", async () => {
    const fieldId = getNextId();

    setup({
      fields: [
        createMockField({
          id: fieldId,
          display_name: "type/Temporal",
          base_type: "type/DateTime",
          effective_type: "type/Text",
        }),
      ],
      fieldId,
      initialValue: null,
    });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Title")).toBeInTheDocument();
    expect(dropdown.queryByText("Birthday")).not.toBeInTheDocument();
    expect(dropdown.queryByText("Creation date")).not.toBeInTheDocument();
  });

  it("falls back to using field's base_type if effective_type is not available", async () => {
    const fieldId = getNextId();

    setup({
      fields: [
        createMockField({
          id: fieldId,
          display_name: "type/Temporal",
          base_type: "type/DateTime",
          effective_type: undefined,
        }),
      ],
      fieldId,
      initialValue: null,
    });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.queryByText("Title")).not.toBeInTheDocument();
    expect(dropdown.getByText("Birthday")).toBeInTheDocument();
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
  });
});
