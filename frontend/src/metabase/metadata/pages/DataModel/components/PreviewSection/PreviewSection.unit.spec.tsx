import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { PreviewSection } from "./PreviewSection";
import { type PreviewType, usePreviewType } from "./utils";

function Wrapper({
  onPreviewTypeChange,
}: {
  onPreviewTypeChange: (value: PreviewType) => void;
}) {
  const [previewType, setPreviewType] = usePreviewType();

  function handlePreviewTypeChange(previewType: PreviewType) {
    onPreviewTypeChange(previewType);
    setPreviewType(previewType);
  }

  return (
    <PreviewSection
      previewType={previewType}
      onPreviewTypeChange={handlePreviewTypeChange}
    />
  );
}

function setup() {
  const onPreviewTypeChange = jest.fn();

  renderWithProviders(<Wrapper onPreviewTypeChange={onPreviewTypeChange} />);

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
