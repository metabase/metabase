import fetchMock from "fetch-mock";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { render, renderWithProviders, screen } from "__support__/ui";
import { getParameterFieldInfo } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { createMockField, createMockParameter } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

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

  const idField = getParameterFieldInfo(
    createMockField({
      id: PEOPLE_ID,
      display_name: "ID",
      base_type: "type/BigInteger",
      semantic_type: "type/PK",
      has_field_values: "none",
      name_field: createMockField({
        id: PEOPLE_NAME_ID,
        display_name: "Name",
        semantic_type: "type/Name",
      }),
    }),
  );

  it("should render remapped label for value", async () => {
    fetchMock.post("path:/api/dataset/parameter/remapping", [
      2,
      "Domenica Williamson",
    ]);

    renderWithProviders(
      <ParameterFieldWidgetValue
        value={[2]}
        fields={[idField]}
        parameter={createMockParameter({
          id: "p1",
          type: "id",
          sectionId: "id",
        })}
      />,
      {
        storeInitialState: createMockState({
          entities: createMockEntitiesState({
            databases: [createSampleDatabase()],
          }),
        }),
      },
    );

    expect(await screen.findByText("Domenica Williamson")).toBeInTheDocument();
  });
});
