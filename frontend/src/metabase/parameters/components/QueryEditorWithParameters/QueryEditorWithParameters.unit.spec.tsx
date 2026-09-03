import { render, screen } from "@testing-library/react";
import { isValidElement } from "react";

import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { QueryEditor } from "metabase/querying/editor/components/QueryEditor/QueryEditor";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { NativeQueryParametersList } from "../NativeQueryParametersList";
import { TemplateTagsSidebar } from "../TemplateTagsSidebar";

import { QueryEditorWithParameters } from "./QueryEditorWithParameters";

jest.mock(
  "metabase/querying/editor/components/QueryEditor/QueryEditor",
  () => ({
    ...jest.requireActual(
      "metabase/querying/editor/components/QueryEditor/QueryEditor",
    ),
    QueryEditor: jest.fn(() => <div data-testid="query-editor" />),
  }),
);

function setup() {
  const query = new Question(createMockCard(), SAMPLE_METADATA).query();
  const onChangeQuery = jest.fn();
  const onChangeUiState = jest.fn();

  render(
    <QueryEditorWithParameters
      query={query}
      uiState={getInitialUiState()}
      height={300}
      onChangeQuery={onChangeQuery}
      onChangeUiState={onChangeUiState}
    />,
  );

  const [props] = jest.mocked(QueryEditor).mock.calls[0];
  return { props, query, onChangeQuery, onChangeUiState };
}

describe("QueryEditorWithParameters", () => {
  beforeEach(() => {
    jest.mocked(QueryEditor).mockClear();
  });

  it("should render NativeQueryParametersList in the parametersList slot", () => {
    const { props } = setup();
    const { parametersList } = props;

    expect(screen.getByTestId("query-editor")).toBeInTheDocument();
    expect(isValidElement(parametersList) && parametersList.type).toBe(
      NativeQueryParametersList,
    );
  });

  it("should pass TemplateTagsSidebar as the templateTagsSidebar", () => {
    const { props } = setup();

    expect(props.templateTagsSidebar).toBe(TemplateTagsSidebar);
  });

  it("should forward the remaining props to QueryEditor", () => {
    const { props, query, onChangeQuery, onChangeUiState } = setup();

    expect(props.query).toBe(query);
    expect(props.height).toBe(300);
    expect(props.onChangeQuery).toBe(onChangeQuery);
    expect(props.onChangeUiState).toBe(onChangeUiState);
  });
});
