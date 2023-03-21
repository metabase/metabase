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
import { createSampleDatabase, PEOPLE } from "metabase-types/api/mocks/presets";
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

    const input = screen.getByRole("textbox", { name: "Filter widget label" });
    userEvent.clear(input);
    userEvent.type(input, "New");
    userEvent.tab();

    expect(setTemplateTag).toHaveBeenCalledWith({
      ...tag,
      "display-name": "New",
    });
  });

  it("should be able to change the widget type", () => {
    const tag = createMockTemplateTag({
      type: "dimension",
      dimension: ["field", PEOPLE.NAME, null],
      "widget-type": "string/starts-with",
    });
    const { setTemplateTag } = setup({ tag });

    userEvent.click(screen.getByText("String starts with"));
    userEvent.click(screen.getByText("String contains"));

    expect(setTemplateTag).toHaveBeenCalledWith({
      ...tag,
      "widget-type": "string/contains",
    });
  });

  it("should be able to make the tag required", () => {
    const tag = createMockTemplateTag();
    const { setTemplateTag } = setup({ tag });

    const toggle = screen.getByRole("switch", { name: "Required?" });
    userEvent.click(toggle);

    expect(setTemplateTag).toHaveBeenCalledWith({
      ...tag,
      required: true,
    });
  });

  it("should clear the default value when becoming not required", () => {
    const tag = createMockTemplateTag({ required: true, default: "abc" });
    const { setTemplateTag } = setup({ tag });

    const toggle = screen.getByRole("switch", { name: "Required?" });
    userEvent.click(toggle);

    expect(setTemplateTag).toHaveBeenCalledWith({
      ...tag,
      required: false,
      default: undefined,
    });
  });
});
