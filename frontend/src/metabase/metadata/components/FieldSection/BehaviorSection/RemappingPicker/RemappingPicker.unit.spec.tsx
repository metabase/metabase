import fetchMock from "fetch-mock";

import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  createMockField,
  createMockFieldDimension,
  createMockFieldValues,
} from "metabase-types/api/mocks/field";

import { RemappingPicker } from "./RemappingPicker";

const FIELD_ID = 1;

const setup = ({
  hasInternalDimension = false,
}: { hasInternalDimension?: boolean } = {}) => {
  const database = createMockDatabase({ id: 1 });
  const field = createMockField({
    id: FIELD_ID,
    table_id: 1,
    dimensions: hasInternalDimension
      ? [createMockFieldDimension({ id: 10, type: "internal", name: "Custom" })]
      : [],
  });

  setupFieldValuesEndpoint(createMockFieldValues({ field_id: FIELD_ID }));

  renderWithProviders(
    <RemappingPicker
      database={database}
      field={field}
      onTrackMetadataChange={jest.fn()}
    />,
  );

  return { database, field };
};

const fieldValuesCalls = () =>
  fetchMock.callHistory.calls(`path:/api/field/${FIELD_ID}/values`);

describe("RemappingPicker (metabase#62626)", () => {
  it("does not fetch field values when display value is not 'custom' and the dropdown is closed", async () => {
    setup({ hasInternalDimension: false });

    // RTK Query subscribes in an effect, so wait for the picker to mount before counting requests.
    expect(
      await screen.findByPlaceholderText("Select display values"),
    ).toBeInTheDocument();

    expect(fieldValuesCalls()).toHaveLength(0);
  });

  it("fetches field values when display value is 'custom'", async () => {
    setup({ hasInternalDimension: true });

    expect(
      await screen.findByPlaceholderText("Select display values"),
    ).toBeInTheDocument();

    await waitFor(() => expect(fieldValuesCalls().length).toBeGreaterThan(0));
  });
});
