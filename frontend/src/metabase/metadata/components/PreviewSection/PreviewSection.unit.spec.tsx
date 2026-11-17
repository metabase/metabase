import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupCardDataset } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createOrdersTable,
  createOrdersTotalField,
  createSampleDatabase,
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

function setup({ status = 200 }: { status?: number } = {}) {
  setupCardDataset({ status });

  const onPreviewTypeChange = jest.fn();

  renderWithProviders(
    <TestComponent onPreviewTypeChange={onPreviewTypeChange} />,
    {
      // the preview query is built from the metadata store, so an empty store
      // means no request is ever issued
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
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

  describe("error handling", () => {
    it("shows an error in the table preview when the query fails", async () => {
      setup({ status: 500 });

      expect(await screen.findByText("Something went wrong")).toBeVisible();
    });

    it("shows an error in the object detail preview when the query fails", async () => {
      setup({ status: 500 });

      await userEvent.click(screen.getByLabelText("Detail"));

      expect(await screen.findByText("Something went wrong")).toBeVisible();
    });
  });
});
