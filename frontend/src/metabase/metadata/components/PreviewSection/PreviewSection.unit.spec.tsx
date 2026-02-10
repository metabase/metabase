import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import {
  createOrdersTable,
  createOrdersTotalField,
} from "metabase-types/api/mocks/presets";

import { PreviewSection } from "./PreviewSection";
import type { PreviewType } from "./types";

registerVisualizations();

const table = createOrdersTable();
const field = createOrdersTotalField();

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
      field={field}
      table={table}
      previewType={previewType}
      onPreviewTypeChange={handlePreviewTypeChange}
      onClose={jest.fn()}
    />
  );
}

function setup() {
  setupCardDataset();

  const onPreviewTypeChange = jest.fn();

  renderWithProviders(
    <TestComponent onPreviewTypeChange={onPreviewTypeChange} />,
  );

  return { onPreviewTypeChange };
}

describe("PreviewSection", () => {
  it("should be possible to change the preview type", async () => {
    const { onPreviewTypeChange } = setup();

    await userEvent.click(screen.getByLabelText("Detail"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("detail");

    await userEvent.click(screen.getByLabelText("Filtering"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("filtering");

    await userEvent.click(screen.getByLabelText("Table"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("table");
  });
});
