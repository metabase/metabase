import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type Field from "metabase-lib/v1/metadata/Field";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { FieldId } from "metabase-types/api";
import { ORDERS, createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { SemanticTypePicker } from "./SemanticTypePicker";

interface SetupOpts {
  fieldId?: FieldId;
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

const setup = ({
  fieldId = ORDERS.CREATED_AT,
  initialValue,
}: SetupOpts = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });
  const metadata = getMetadata(state);
  const field = checkNotNull(metadata.field(fieldId));

  renderWithProviders(
    <TestComponent field={field} initialValue={initialValue} />,
  );
};

describe("SemanticTypePicker", () => {
  it("does not show deprecated semantic types", async () => {
    setup();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });

  it("shows deprecated semantic type if it is already selected", async () => {
    setup({ initialValue: TYPE.CancelationDate });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.getByText("Cancelation date")).toBeInTheDocument();
  });

  it("hides deprecated semantic type after it is deselected", async () => {
    setup({ initialValue: TYPE.CancelationDate });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);
    const dropdown = within(screen.getByRole("listbox"));
    await userEvent.click(dropdown.getByText("Creation date"));
    await userEvent.click(picker);

    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });
});
