import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { createMockMetadataFromState } from "__support__/metadata";
import { setupCardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type Question from "metabase-lib/v1/Question";
import type { Parameter, ParameterValuesMap } from "metabase-types/api";
import {
  createMockCard,
  createMockParameter,
  createMockUser,
} from "metabase-types/api/mocks";

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

const setup = async ({
  hasPublicLink = true,
  isAdmin = true,
  parameters = [],
  parameterValues = {},
}: {
  hasPublicLink?: boolean;
  isAdmin?: boolean;
  parameters?: Parameter[];
  parameterValues?: ParameterValuesMap;
} = {}) => {
  const TEST_CARD = createMockCard({
    id: TEST_CARD_ID,
    public_uuid: hasPublicLink ? "mock-uuid" : null,
    parameters,
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
  const question = checkNotNull(
    metadata.question(TEST_CARD_ID),
  ).setParameterValues(parameterValues);

  const onClose = jest.fn();

  renderWithProviders(<TestComponent question={question} onClose={onClose} />, {
    storeInitialState: state,
  });

  await screen.findByText("Public link");
};

describe("QuestionPublicLinkPopover", () => {
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

  it.each(["csv", "xlsx", "json"])(
    "should include the selected parameter values in the %s export link",
    async (extension) => {
      await setup({
        parameters: [
          createMockParameter({ id: "group", slug: "group" }),
          createMockParameter({ id: "unset", slug: "unset" }),
          createMockParameter({ id: "count", type: "number/=" }),
        ],
        parameterValues: { group: ["A & B", "香港 + %"], count: 0 },
      });

      await userEvent.click(screen.getByText(extension));

      const input = screen.getByRole("textbox");
      expect(input).toHaveValue(
        `${SITE_URL}/public/question/mock-uuid.${extension}?${new URLSearchParams(
          {
            parameters: JSON.stringify([
              { id: "group", value: ["A & B", "香港 + %"] },
              { id: "count", value: 0 },
            ]),
          },
        )}`,
      );
    },
  );

  it("should keep export links without selected parameters unchanged", async () => {
    await setup({ parameters: [createMockParameter()] });

    await userEvent.click(screen.getByText("csv"));

    expect(
      screen.getByDisplayValue(`${SITE_URL}/public/question/mock-uuid.csv`),
    ).toBeInTheDocument();
  });

  it("should keep the interactive public link unchanged with selected parameters", async () => {
    await setup({
      parameters: [createMockParameter()],
      parameterValues: { "1": "selected" },
    });

    expect(
      screen.getByDisplayValue(`${SITE_URL}/public/question/mock-uuid`),
    ).toBeInTheDocument();
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

  it("should not show non-admins the option to remove a public link", async () => {
    await setup({ isAdmin: false });

    expect(screen.queryByText("Remove public link")).not.toBeInTheDocument();
  });
});
