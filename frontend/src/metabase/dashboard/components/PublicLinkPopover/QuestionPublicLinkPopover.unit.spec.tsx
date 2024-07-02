import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupCardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionPublicLinkPopover } from "./QuestionPublicLinkPopover";

const SITE_URL = "http://metabase.test";
const TEST_CARD_ID = 1;

const TestComponent = ({
  question,
  onClose: onCloseMock,
}: {
  question: Question;
  onClose: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const onClose = () => {
    setIsOpen(false);
    onCloseMock();
  };

  return (
    <QuestionPublicLinkPopover
      question={question}
      isOpen={isOpen}
      onClose={onClose}
      target={<button>Target</button>}
    />
  );
};

const setup = ({
  hasPublicLink = true,
}: {
  hasPublicLink?: boolean;
} = {}) => {
  const TEST_CARD = createMockCard({
    id: TEST_CARD_ID,
    public_uuid: hasPublicLink ? "mock-uuid" : null,
  });

  setupCardPublicLinkEndpoints(TEST_CARD_ID);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    entities: createMockEntitiesState({
      questions: [TEST_CARD],
    }),
    settings: mockSettings({
      "site-url": SITE_URL,
    }),
  });

  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(TEST_CARD_ID));

  const onClose = jest.fn();

  renderWithProviders(<TestComponent question={question} onClose={onClose} />, {
    storeInitialState: state,
  });
};
describe("QuestionPublicLinkPopover", () => {
  it("should display a question-specific public url", async () => {
    setup();

    expect(
      await screen.findByDisplayValue(`${SITE_URL}/public/question/mock-uuid`),
    ).toBeInTheDocument();
  });

  it("should display extensions for the public link", () => {
    setup();

    const extensionOptions = screen.getAllByTestId("extension-option");

    expect(extensionOptions).toHaveLength(3);
    expect(extensionOptions.map(option => option.textContent)).toEqual([
      "csv",
      "xlsx",
      "json",
    ]);
  });

  it("should call Card public link API when creating link", () => {
    setup({ hasPublicLink: false });

    expect(
      fetchMock.calls(`path:/api/card/${TEST_CARD_ID}/public_link`, {
        method: "POST",
      }),
    ).toHaveLength(1);
  });

  it("should call the Card public link API when deleting link", async () => {
    setup({ hasPublicLink: true });
    await userEvent.click(screen.getByText("Remove public link"));
    expect(
      fetchMock.calls(`path:/api/card/${TEST_CARD_ID}/public_link`, {
        method: "DELETE",
      }),
    ).toHaveLength(1);
  });
});
