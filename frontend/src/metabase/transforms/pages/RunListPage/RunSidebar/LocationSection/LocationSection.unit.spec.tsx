import { renderWithProviders, screen } from "__support__/ui";
import type { TransformRun } from "metabase-types/api";
import {
  createMockCollection,
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { LocationSection } from "./LocationSection";

type SetupOpts = {
  run?: TransformRun;
};

function setup({ run = createMockTransformRun() }: SetupOpts = {}) {
  renderWithProviders(<LocationSection run={run} />);
}

describe("LocationSection", () => {
  it("should render the collection name when the transform has a collection", () => {
    const collection = createMockCollection({ name: "My Folder" });
    const transform = createMockTransform({
      collection_id: collection.id,
      collection,
    });
    const run = createMockTransformRun({ transform });
    setup({ run });

    expect(
      screen.getByRole("region", { name: "Location" }),
    ).toBeInTheDocument();
    expect(screen.getByText("My Folder")).toBeInTheDocument();
  });

  it("should not render when the transform has no collection", () => {
    const transform = createMockTransform({ collection_id: null });
    const run = createMockTransformRun({ transform });
    setup({ run });

    expect(
      screen.queryByRole("region", { name: "Location" }),
    ).not.toBeInTheDocument();
  });

  it("should not render when the run has no transform", () => {
    const run = createMockTransformRun({ transform: undefined });
    setup({ run });

    expect(
      screen.queryByRole("region", { name: "Location" }),
    ).not.toBeInTheDocument();
  });
});
