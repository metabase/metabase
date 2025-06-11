import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { PreviewSection } from "./PreviewSection";
import type { PreviewType } from "./types";

const field = createMockField();
const table = createMockTable();

function TestComponent({
  onPreviewTypeChange,
}: {
  onPreviewTypeChange: (value: PreviewType) => void;
}) {
  const [previewType, setPreviewType] = useState<PreviewType>("table");

  function handlePreviewTypeChange(previewType: PreviewType) {
    onPreviewTypeChange(previewType);
    setPreviewType(previewType);
  }

  return (
    <PreviewSection
      databaseId={1}
      field={field}
      fieldId={16}
      previewType={previewType}
      table={table}
      tableId={field.table_id}
      onClose={jest.fn()}
      onPreviewTypeChange={handlePreviewTypeChange}
    />
  );
}

function setup() {
  const onPreviewTypeChange = jest.fn();

  renderWithProviders(
    <TestComponent onPreviewTypeChange={onPreviewTypeChange} />,
  );

  return { onPreviewTypeChange };
}

describe("PreviewSection", () => {
  it("should be possible to change the preview type", async () => {
    const { onPreviewTypeChange } = setup();

    await userEvent.click(screen.getByText("Detail"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("detail");

    await userEvent.click(screen.getByText("Filtering"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("filtering");

    await userEvent.click(screen.getByText("Table"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("table");
  });
});
