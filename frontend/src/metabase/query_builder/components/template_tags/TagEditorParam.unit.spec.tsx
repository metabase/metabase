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

  const setParameterValue = jest.fn();

  renderWithProviders(
    <TagEditorParam tag={tag} setParameterValue={setParameterValue} />,
    { storeInitialState: state },
  );

  return { setParameterValue };
};

describe("TagEditorParam", () => {
  it("should be able to update the name of the tag", async () => {
    setup();

    const input = screen.getByLabelText("Filter widget label");
    userEvent.clear(input);
    userEvent.type(input, "New");
    userEvent.tab();

    expect(await screen.findByDisplayValue("New")).toBeInTheDocument();
  });
});
