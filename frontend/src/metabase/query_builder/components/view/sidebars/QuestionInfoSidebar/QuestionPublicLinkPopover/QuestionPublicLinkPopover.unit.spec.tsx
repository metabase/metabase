import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { createMockMetadataFromState } from "__support__/metadata";
import { setupCardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { expectNoBadSchemaEvents } from "__support__/snowplow";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";

import { QuestionPublicLinkPopover } from "./QuestionPublicLinkPopover";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
const { trackSchemaEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

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

const setup = async ({
  hasPublicLink = true,
  isAdmin = true,
}: {
  hasPublicLink?: boolean;
  isAdmin?: boolean;
} = {}) => {
  const TEST_CARD = createMockCard({
    id: TEST_CARD_ID,
    public_uuid: hasPublicLink ? "mock-uuid" : null,
  });

  setupCardPublicLinkEndpoints(TEST_CARD_ID);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    entities: createMockEntitiesState({
      questions: [TEST_CARD],
    }),
    settings: mockSettings({
      "site-url": SITE_URL,
    }),
  });

  const metadata = createMockMetadataFromState(state);
  const question = new Question(TEST_CARD, metadata);

  const onClose = jest.fn();

  renderWithProviders(<TestComponent question={question} onClose={onClose} />, {
    storeInitialState: state,
  });

  await screen.findByText("Public link");
};

describe("QuestionPublicLinkPopover", () => {
  beforeEach(() => {
    jest.mocked(trackSchemaEvent).mockClear();
  });

  it("should display a question-specific public url", async () => {
    await setup();

    expect(
      await screen.findByDisplayValue(`${SITE_URL}/public/question/mock-uuid`),
    ).toBeInTheDocument();
  });

  it("should display extensions for the public link", async () => {
    await setup();

    const extensionOptions = screen.getAllByTestId("extension-option");

    expect(extensionOptions).toHaveLength(3);
    expect(extensionOptions.map((option) => option.textContent)).toEqual([
      "csv",
      "xlsx",
      "json",
    ]);
  });

  it("should call Card public link API when creating link", async () => {
    await setup({ hasPublicLink: false });

    expect(
      fetchMock.callHistory.calls(
        `path:/api/card/${TEST_CARD_ID}/public_link`,
        {
          method: "POST",
        },
      ),
    ).toHaveLength(1);
  });

  it("should call the Card public link API when deleting link", async () => {
    await setup({ hasPublicLink: true });
    await userEvent.click(screen.getByText("Remove public link"));
    expect(
      fetchMock.callHistory.calls(
        `path:/api/card/${TEST_CARD_ID}/public_link`,
        {
          method: "DELETE",
        },
      ),
    ).toHaveLength(1);
  });

  it("should track copying the public link in every format and removing it", async () => {
    await setup({ hasPublicLink: true });
    const publicUrl = `${SITE_URL}/public/question/mock-uuid`;

    await userEvent.click(screen.getByTestId("copy-button"));
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(publicUrl);
    expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
      event: "public_link_copied",
      artifact: "question",
      format: "html",
    });

    for (const format of ["csv", "xlsx", "json"]) {
      await userEvent.click(screen.getByText(format));
      await userEvent.click(screen.getByTestId("copy-button"));
      expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
        `${publicUrl}.${format}`,
      );
      expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
        event: "public_link_copied",
        artifact: "question",
        format,
      });
    }

    await userEvent.click(screen.getByText("Remove public link"));
    expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
      event: "public_link_removed",
      artifact: "question",
      source: "public-share",
    });
    expect(trackSchemaEvent).toHaveBeenCalledTimes(5);

    expectNoBadSchemaEvents(
      jest.mocked(trackSchemaEvent).mock.calls,
      "embed_flow",
      "1-0-3",
    );
  });

  it("should not show non-admins the option to remove a public link", async () => {
    await setup({ isAdmin: false });

    expect(screen.queryByText("Remove public link")).not.toBeInTheDocument();
  });
});
