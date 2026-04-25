import userEvent from "@testing-library/user-event";

import {
  setupCreateTransformTagEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TransformTag, TransformTagId } from "metabase-types/api";
import { createMockTransformTag } from "metabase-types/api/mocks";

import { TagMultiSelect } from "./TagMultiSelect";

type SetupOpts = {
  tags?: TransformTag[];
  tagIds?: TransformTagId[];
  newTag?: TransformTag;
  readOnly?: boolean;
};

function setup({ tags = [], tagIds = [], newTag, readOnly }: SetupOpts) {
  setupListTransformTagsEndpoint(tags);
  if (newTag != null) {
    setupCreateTransformTagEndpoint(newTag);
  }

  const onChange = jest.fn();
  renderWithProviders(
    <TagMultiSelect tagIds={tagIds} onChange={onChange} readOnly={readOnly} />,
  );

  const input = screen.getByLabelText("Tags");
  return { input, onChange };
}

describe("TagMultiSelect", () => {
  it("should clear the input after creating a tag", async () => {
    const { input } = setup({
      tags: [],
      newTag: createMockTransformTag({ name: "foo" }),
    });
    await userEvent.type(input, "foo");
    await userEvent.click(screen.getByText(/Create/));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("should show a message when there are no tags", async () => {
    const { input } = setup({ tags: [] });
    await userEvent.click(input);
    expect(
      await screen.findByText("Start typing to create a tag"),
    ).toBeInTheDocument();
  });

  it("should show a message when there all tags are selected", async () => {
    const tag = createMockTransformTag();
    const { input } = setup({ tags: [tag], tagIds: [tag.id] });
    await userEvent.click(input);
    expect(await screen.findByText("All tags selected")).toBeInTheDocument();
  });

  it("should show a message when there all tags are selected but the search text matches with the same of one of the tags", async () => {
    const tag = createMockTransformTag({ name: "foo" });
    const { input } = setup({ tags: [tag], tagIds: [tag.id] });
    await userEvent.type(input, tag.name);
    expect(
      await screen.findByText("A tag with that name already exists"),
    ).toBeInTheDocument();
  });

  it("should show a message when there not all tags are selected but the search text matches with the same of one of the tags", async () => {
    const tag1 = createMockTransformTag({ id: 1, name: "foo" });
    const tag2 = createMockTransformTag({ id: 2, name: "bar" });
    const { input } = setup({ tags: [tag1, tag2], tagIds: [tag1.id] });
    await userEvent.type(input, tag1.name);
    expect(
      await screen.findByText("A tag with that name already exists"),
    ).toBeInTheDocument();
  });

  it("should disable input when readOnly flag is set to true", () => {
    const { input } = setup({ readOnly: true });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "Tags are read-only");
  });
});
