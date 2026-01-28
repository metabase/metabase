import userEvent from "@testing-library/user-event";

import { setupListTransformTagsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TransformJob, TransformTag } from "metabase-types/api";
import {
  createMockTransformJob,
  createMockTransformTag,
} from "metabase-types/api/mocks";

import { TagSection } from "./TagSection";

type SetupOpts = {
  job?: TransformJob;
  tags?: TransformTag[];
};

function setup({ job = createMockTransformJob(), tags = [] }: SetupOpts) {
  setupListTransformTagsEndpoint(tags);

  const onTagsChange = jest.fn();
  renderWithProviders(<TagSection job={job} onTagsChange={onTagsChange} />);

  return { onTagsChange };
}

describe("TagSection", () => {
  it("should allow to edit tags", async () => {
    const tag = createMockTransformTag();
    const { onTagsChange } = setup({ tags: [tag] });
    await userEvent.click(screen.getByPlaceholderText("Add tags"));
    await userEvent.click(await screen.findByText(tag.name));
    expect(onTagsChange).toHaveBeenLastCalledWith([tag.id], true);
  });
});
