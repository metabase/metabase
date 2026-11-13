import { type ComponentProps, useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";
import {
  createMockCard,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { DatasetFieldMetadataSidebar } from "./DatasetFieldMetadataSidebar";

type TestEditorProps = Pick<
  ComponentProps<typeof DatasetFieldMetadataSidebar>,
  "dataset" | "field" | "onFieldMetadataChange"
>;

function TestEditor({
  dataset,
  field: initialField,
  onFieldMetadataChange,
}: TestEditorProps) {
  const [field, setField] = useState(initialField);

  const handleChange = (changes: Partial<DatasetColumn>) => {
    onFieldMetadataChange(changes);
    setField((current) => ({ ...current, ...changes }));
  };

  return (
    <DatasetFieldMetadataSidebar
      dataset={dataset}
      field={field}
      isLastField={false}
      handleFirstFieldFocus={() => {}}
      onFieldMetadataChange={handleChange}
      onMappedDatabaseColumnChange={() => {}}
    />
  );
}

function setup() {
  const dataset = new Question(
    createMockCard({
      type: "model",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    }),
    createMockMetadata(),
  );
  const field = createMockNumericColumn({
    name: "total",
    display_name: "Total",
    description: "Old description",
    source: "fields",
    settings: {},
  });
  const onFieldMetadataChange = jest.fn<void, [Partial<DatasetColumn>]>();

  renderWithProviders(
    <TestEditor
      dataset={dataset}
      field={field}
      onFieldMetadataChange={onFieldMetadataChange}
    />,
  );

  return { onFieldMetadataChange };
}

describe("DatasetFieldMetadataSidebar", () => {
  it("debounces edits to the same field and preserves the latest value", async () => {
    const { onFieldMetadataChange } = setup();
    const input = screen.getByRole("textbox", { name: "Display name" });

    fireEvent.change(input, { target: { value: "Gross sales" } });
    fireEvent.change(input, { target: { value: "Net sales" } });

    expect(onFieldMetadataChange).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onFieldMetadataChange).toHaveBeenCalledWith({
        display_name: "Net sales",
      }),
    );
    expect(onFieldMetadataChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Net sales");
  });

  it.each([
    {
      firstLabel: "Display name",
      firstValue: "Net sales",
      secondLabel: "Description",
      secondValue: "Sales after refunds",
    },
    {
      firstLabel: "Description",
      firstValue: "Sales after refunds",
      secondLabel: "Display name",
      secondValue: "Net sales",
    },
  ])(
    "preserves both edits when $firstLabel is changed before $secondLabel",
    async ({ firstLabel, firstValue, secondLabel, secondValue }) => {
      const { onFieldMetadataChange } = setup();

      fireEvent.change(screen.getByRole("textbox", { name: firstLabel }), {
        target: { value: firstValue },
      });
      fireEvent.change(screen.getByRole("textbox", { name: secondLabel }), {
        target: { value: secondValue },
      });

      await waitFor(() => {
        const changes = onFieldMetadataChange.mock.calls.reduce<
          Partial<DatasetColumn>
        >((merged, [patch]) => ({ ...merged, ...patch }), {});

        expect(changes).toMatchObject({
          display_name: "Net sales",
          description: "Sales after refunds",
        });
      });
      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: "Display name" }),
        ).toHaveValue("Net sales");
        expect(
          screen.getByRole("textbox", { name: "Description" }),
        ).toHaveValue("Sales after refunds");
      });
    },
  );
});
