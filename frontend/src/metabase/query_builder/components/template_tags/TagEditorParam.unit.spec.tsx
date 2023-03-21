import React from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createEntitiesState } from "__support__/store";
import { TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";
import TagEditorParam from "./TagEditorParam";

interface SetupOpts {
  tag?: TemplateTag;
}

const setup = ({ tag = createMockTemplateTag() }: SetupOpts = {}) => {
  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: createMockCard({
        dataset_query: createMockNativeDatasetQuery(),
      }),
    }),
    entities: createEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const setTemplateTag = jest.fn();
  const setTemplateTagConfig = jest.fn();
  const setParameterValue = jest.fn();

  renderWithProviders(
    <TagEditorParam
      tag={tag}
      setTemplateTag={setTemplateTag}
      setTemplateTagConfig={setTemplateTagConfig}
      setParameterValue={setParameterValue}
    />,
    { storeInitialState: state },
  );

  return { setTemplateTag, setTemplateTagConfig, setParameterValue };
};

describe("TagEditorParam", () => {
  it("should be able to update the name of the tag", async () => {
    const tag = createMockTemplateTag();
    const { setTemplateTag } = setup({ tag });

    const input = screen.getByLabelText("Filter widget label");
    userEvent.clear(input);
    userEvent.type(input, "New");
    userEvent.tab();

    expect(setTemplateTag).toHaveBeenCalledWith({
      ...tag,
      "display-name": "New",
    });
  });
});
