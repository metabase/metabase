import React from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createMockDatabase,
  createMockNativeCard,
} from "metabase-types/api/mocks";
import { createMockEntitiesState } from "__support__/store";
import { createMockState } from "metabase-types/store/mocks";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";

jest.mock("metabase/query_builder/components/NativeQueryEditor", () => {
  const OriginalNativeQueryEditor = jest.requireActual(
    "metabase/query_builder/components/NativeQueryEditor",
  );

  return props => {
    const { shouldRenderChild } = props;
    if (!shouldRenderChild) {
      return null; // Render a null component if shouldRenderChild is false
    }
    return (
      <OriginalNativeQueryEditor {...props}>
        <div data-testid="custom-child-component" />
      </OriginalNativeQueryEditor>
    );
  };
});

const DATABASE_ID = 1;
const TEST_CARD = createMockNativeCard();
const setup = () => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createMockDatabase({ id: DATABASE_ID })],
      questions: [TEST_CARD],
    }),
  });
  const metadata = getMetadata(state);

  const question = metadata.question(TEST_CARD.id);

  renderWithProviders(
    <NativeQueryEditor
      question={question}
      query={question.query()}
      isNativeEditorOpen={true}
      shouldRenderChild={false} // Set this prop to control whether the child component is rendered
    />,
  );
  return {};
};

describe("NativeQueryEditorSidebar", () => {
  it("should not render the custom child component", () => {
    setup();
    userEvent.click(screen.getByLabelText("snippet icon"));

    expect(
      screen.queryByTestId("custom-child-component"),
    ).not.toBeInTheDocument();
  });
});
