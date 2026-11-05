import { renderWithProviders, screen } from "__support__/ui";
import {
  NativeQueryEditorContextProvider,
  type NativeQueryEditorContextValue,
} from "metabase/querying/components/NativeQueryEditor/context/NativeQueryEditorContext";
import { checkNotNull } from "metabase/utils/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import {
  createMockCard,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { NativeQueryParametersList } from "./NativeQueryParametersList";

const TAG_ID = "category-tag";
const DEFAULT_VALUE = "Gizmo";

function setup() {
  const card = createMockCard({
    dataset_query: {
      type: "native",
      database: SAMPLE_DB_ID,
      native: {
        query: "select * from products where category = {{category}}",
        "template-tags": {
          category: createMockTemplateTag({
            id: TAG_ID,
            name: "category",
            "display-name": "Category",
            type: "text",
            required: true,
            default: DEFAULT_VALUE,
          }),
        },
      },
    },
  });
  const question = new Question(card, SAMPLE_METADATA).setParameterValues({
    [TAG_ID]: DEFAULT_VALUE,
  });
  const query: NativeQuery = checkNotNull(question.legacyNativeQuery());

  const context: NativeQueryEditorContextValue = {
    question,
    query,
    setDatasetQuery: jest.fn(),
    focusEditor: jest.fn(),
    onFormatQuery: jest.fn(),
    isNativeEditorOpen: true,
    toggleEditor: jest.fn(),
    canChangeDatabase: true,
    editorContext: "question",
    setParameterValue: jest.fn(),
    isRunnable: true,
    isRunning: false,
    isResultDirty: false,
    snippets: [],
    snippetCollections: [],
    isShowingDataReference: false,
    isShowingSnippetSidebar: false,
    isShowingTemplateTagsEditor: false,
  };

  renderWithProviders(
    <NativeQueryEditorContextProvider value={context}>
      <NativeQueryParametersList />
    </NativeQueryEditorContextProvider>,
  );
}

describe("NativeQueryParametersList", () => {
  it("should apply the required behavior to template tag widgets", () => {
    setup();

    expect(screen.getByRole("textbox")).toHaveValue(DEFAULT_VALUE);
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset filter to default state" }),
    ).not.toBeInTheDocument();
  });
});
