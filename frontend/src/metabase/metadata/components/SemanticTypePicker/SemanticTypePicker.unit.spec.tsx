import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { Field, FieldId, FieldReference } from "metabase-types/api";
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
  base_type: "type/Collection",
  effective_type: "type/JSON",
});

const STRUCTURED_FIELD = createMockField({
  id: getNextId(),
  display_name: "type/Structured",
  base_type: "type/Structured",
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
];

interface SetupOpts {
  fields?: Field[];
  fieldId: FieldId | FieldReference;
  initialValue?: string | null;
}

interface TestComponentProps {
  initialValue: string | null;
  field: Field;
}

function TestComponent({ field, initialValue }: TestComponentProps) {
  const [value, setValue] = useState<string | null>(initialValue);

  return <SemanticTypePicker field={field} value={value} onChange={setValue} />;
}

const setup = ({
  fields = FIELDS,
  fieldId,
  initialValue = null,
}: SetupOpts) => {
  const field = checkNotNull(fields.find((field) => field.id === fieldId));

  renderWithProviders(
    <TestComponent field={field} initialValue={initialValue} />,
  );
};

describe("SemanticTypePicker", () => {
  describe("deprecated semantic types", () => {
    it("does not show deprecated semantic types", async () => {
      setup({ fieldId: TEMPORAL_FIELD.id });

      await assertSemanticTypesVisibility({
        visibleTypes: ["Creation date"],
        hiddenTypes: ["Cancelation date"],
      });
    });

    it("shows deprecated semantic type if it is already selected", async () => {
      setup({
        fieldId: TEMPORAL_FIELD.id,
        initialValue: TYPE.CancelationDate,
      });

      expect(screen.getByText("Cancelation date")).toBeInTheDocument();

      await assertSemanticTypesVisibility({
        visibleTypes: ["Creation date", "Cancelation date"],
      });
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
  });

  it("hides Category semantic type for boolean field's", async () => {
    setup({ fieldId: BOOLEAN_FIELD.id });

    await assertSemanticTypesVisibility({
      hiddenTypes: ["Category"],
    });
  });

  describe("Entity Key, Foreign Key, and No semantic type", () => {
    it.each(FIELDS)(
      "shows Entity Key, Foreign Key, and No semantic type when field's effective_type is derived from $display_name",
      async (field) => {
        setup({ fieldId: field.id });

        await assertSemanticTypesVisibility({
          visibleTypes: ["Entity Key", "Foreign Key", "No semantic type"],
        });
      },
    );
  });

  describe("Entity Name", () => {
    it("shows Entity Name when field's effective_type is derived from text/Type", async () => {
      setup({ fieldId: TEXT_FIELD.id });

      await assertSemanticTypesVisibility({
        visibleTypes: ["Entity Name"],
      });
    });

    it.each([
      TEXT_LIKE_FIELD,
      BOOLEAN_FIELD,
      NUMBER_FIELD,
      TEMPORAL_FIELD,
      COLLECTION_FIELD,
      STRUCTURED_FIELD,
    ])(
      "does not show Entity Name when field's effective_type is derived from $display_name",
      async (field) => {
        setup({ fieldId: field.id });

        await assertSemanticTypesVisibility({
          hiddenTypes: ["Entity Name"],
        });
      },
    );
  });

  describe("Field containing JSON", () => {
    it.each([STRUCTURED_FIELD, COLLECTION_FIELD])(
      "shows Field containing JSON semantic type when field's effective_type is derived from $display_name",
      async (field) => {
        setup({ fieldId: field.id });

        await assertSemanticTypesVisibility({
          visibleTypes: ["Category", "Field containing JSON"],
          hiddenTypes: ["Title"],
        });
      },
    );
  });

  it("does not show semantic types derived from type/Number when field's effective_type is derived from type/Text", async () => {
    setup({ fieldId: TEXT_FIELD.id });

    await assertSemanticTypesVisibility({
      hiddenTypes: [
        "Latitude",
        "Longitude",
        "Currency",
        "Discount",
        "Income",
        "Quantity",
        "Score",
        "Percentage",
      ],
    });
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
    });

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    await assertSemanticTypesVisibility({
      visibleTypes: ["Title"],
      hiddenTypes: ["Birthday", "Creation date"],
    });
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
    });

    await assertSemanticTypesVisibility({
      visibleTypes: ["Birthday", "Creation date"],
      hiddenTypes: ["Title"],
    });
  });
});

async function assertSemanticTypesVisibility({
  visibleTypes = [],
  hiddenTypes = [],
}: {
  visibleTypes?: string[];
  hiddenTypes?: string[];
}) {
  const picker = screen.getByPlaceholderText("Select a semantic type");

  await userEvent.click(picker);

  const dropdown = within(screen.getByRole("listbox"));

  for (const type of visibleTypes) {
    expect(dropdown.getByText(type)).toBeInTheDocument();
  }

  for (const type of hiddenTypes) {
    expect(dropdown.queryByText(type)).not.toBeInTheDocument();
  }
}
