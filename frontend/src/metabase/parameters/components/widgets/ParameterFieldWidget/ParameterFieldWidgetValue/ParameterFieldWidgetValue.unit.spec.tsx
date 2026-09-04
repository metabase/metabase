import { createMockEntitiesState } from "__support__/store";
import { render, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockField } from "metabase-types/api/mocks";
import { ORDERS, createSampleDatabase } from "metabase-types/api/mocks/presets";

import { ParameterFieldWidgetValue } from "./ParameterFieldWidgetValue";

const value = "A value";

describe("when fields is empty array", () => {
  it("renders value if it is a single item", () => {
    render(<ParameterFieldWidgetValue value={[value]} fields={[]} />);
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  it("renders number of selections if multiple items", () => {
    render(<ParameterFieldWidgetValue value={[value, value]} fields={[]} />);
    expect(screen.getByText("2 selections")).toBeInTheDocument();
  });
});

describe("when a field remaps its values", () => {
  const PEOPLE_ID = 10;
  const PEOPLE_NAME_ID = 11;

  // the shape the backend hydrates into `param_fields`: a PK carries the
  // `type/Name` field of its table, which is what its values remap to
  const nameField = createMockField({
    id: PEOPLE_NAME_ID,
    name: "NAME",
    display_name: "Name",
    base_type: "type/Text",
    semantic_type: "type/Name",
    has_field_values: "list",
  });

  const idField = createMockField({
    id: PEOPLE_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    has_field_values: "none",
    name_field: nameField,
  });

  it("renders the remapped label the store accumulated for the value", () => {
    const state = createMockState({
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
      }),
    });
    state.entities.fields[PEOPLE_ID] = {
      ...state.entities.fields[ORDERS.ID],
      id: PEOPLE_ID,
      uniqueId: String(PEOPLE_ID),
      remappings: [[2, "Domenica Williamson"]],
    };

    renderWithProviders(
      <ParameterFieldWidgetValue value={[2]} fields={[idField]} />,
      { storeInitialState: state },
    );

    expect(screen.getByText("Domenica Williamson")).toBeInTheDocument();
  });
});
