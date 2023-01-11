import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";

import {
  fireEvent,
  renderWithProviders,
  getIcon,
  queryIcon,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { PRODUCTS, PEOPLE } from "__support__/sample_database_fixture";
import {
  setupCardEndpoints,
  setupCollectionEndpoints,
  setupDatabasesEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";

import Models from "metabase/entities/questions";

import type { Card, Collection, Field } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

import type Question from "metabase-lib/Question";
import {
  getStructuredModel,
  getNativeModel,
  getSavedStructuredQuestion,
  getSavedNativeQuestion,
} from "metabase-lib/mocks";

import ModelDetailPage from "./ModelDetailPage";

console.warn = jest.fn();

// eslint-disable-next-line react/display-name
jest.mock("metabase/core/components/Link", () => ({ to, ...props }: any) => (
  <a {...props} href={to} />
));

const COLLECTION_1 = createMockCollection({
  id: 5,
  name: "C1",
  can_write: true,
});

const COLLECTION_2 = createMockCollection({
  id: 10,
  name: "C2",
  can_write: true,
});

type SetupOpts = {
  model: Question;
  collections?: Collection[];
  usedBy?: Question[];
};

async function setup({ model, collections = [], usedBy = [] }: SetupOpts) {
  const scope = nock(location.origin).persist();

  const modelUpdateSpy = jest.spyOn(Models.actions, "update");

  const database = model.database();
  const tables = database?.tables || [];
  const card = model.card() as Card;
  const slug = `${card.id}-model-name`;

  if (database) {
    setupDatabasesEndpoints(scope, [database]);
    setupTableEndpoints(scope, tables);
  }

  scope
    .get("/api/card")
    .query({ f: "using_model", model_id: card.id })
    .reply(
      200,
      usedBy.map(question => question.card()),
    );

  setupCardEndpoints(scope, [card]);

  setupCollectionEndpoints(scope, collections);

  renderWithProviders(<ModelDetailPage params={{ slug }} />, {
    withSampleDatabase: true,
  });

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  return { modelUpdateSpy };
}

describe("ModelDetailPage", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  [
    { type: "structured", getModel: getStructuredModel },
    { type: "native", getModel: getNativeModel },
  ].forEach(testCase => {
    const { type, getModel } = testCase;

    describe(`${type} model`, () => {
      it("renders and shows general info", async () => {
        await setup({
          model: getModel({ name: "My Model", description: "Foo Bar" }),
        });

        expect(screen.getByText("My Model")).toBeInTheDocument();
        expect(screen.getByLabelText("Description")).toHaveTextContent(
          "Foo Bar",
        );
      });

      it("displays model contact", async () => {
        const creator = createMockUser();
        await setup({ model: getModel({ creator }) });

        expect(screen.getByLabelText("Contact")).toHaveTextContent(
          creator.common_name,
        );
      });

      describe("management", () => {
        it("allows to rename modal", async () => {
          const model = getModel();
          const { modelUpdateSpy } = await setup({ model });

          const input = screen.getByDisplayValue(model.displayName() as string);
          userEvent.clear(input);
          userEvent.type(input, "New model name");
          fireEvent.blur(input);

          await waitFor(() => {
            expect(modelUpdateSpy).toHaveBeenCalledWith({
              ...model.card(),
              name: "New model name",
            });
          });
        });

        it("allows to change description", async () => {
          const model = getModel();
          const { modelUpdateSpy } = await setup({ model });

          const input = screen.getByPlaceholderText("Add description");
          userEvent.type(input, "Foo bar");
          fireEvent.blur(input);

          await waitFor(() => {
            expect(modelUpdateSpy).toHaveBeenCalledWith({
              ...model.card(),
              description: "Foo bar",
            });
          });
          expect(screen.getByLabelText("Description")).toHaveTextContent(
            "Foo bar",
          );
        });

        it("can be archived", async () => {
          const model = getModel();
          const { modelUpdateSpy } = await setup({ model });

          userEvent.click(getIcon("ellipsis"));
          userEvent.click(screen.getByText("Archive"));

          expect(screen.getByRole("dialog")).toBeInTheDocument();
          userEvent.click(screen.getByRole("button", { name: "Archive" }));

          await waitFor(() => {
            expect(modelUpdateSpy).toHaveBeenCalledWith(
              { id: model.id() },
              { archived: true },
              expect.anything(),
            );
          });
        });

        it("can be moved to another collection", async () => {
          const model = getModel({ collection_id: 1 });
          const { modelUpdateSpy } = await setup({
            model,
            collections: [COLLECTION_1, COLLECTION_2],
          });

          userEvent.click(getIcon("ellipsis"));
          userEvent.click(screen.getByText("Move"));

          expect(screen.getByRole("dialog")).toBeInTheDocument();
          userEvent.click(await screen.findByText(COLLECTION_2.name));
          userEvent.click(screen.getByRole("button", { name: "Move" }));

          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

          await waitFor(() => {
            expect(modelUpdateSpy).toHaveBeenCalledWith(
              { id: model.id() },
              { collection_id: COLLECTION_2.id },
              expect.anything(),
            );
          });
        });
      });

      describe("used by section", () => {
        it("has an empty state", async () => {
          const model = getModel();
          await setup({ model });

          expect(
            screen.getByRole("link", { name: /Create a new question/i }),
          ).toHaveAttribute("href", model.getUrl());
          expect(
            screen.getByText(/This model is not used by any questions yet/i),
          ).toBeInTheDocument();
        });

        it("lists questions based on the model", async () => {
          const q1 = getSavedStructuredQuestion({ id: 5, name: "Q1" });
          const q2 = getSavedNativeQuestion({ id: 6, name: "Q2" });

          await setup({
            model: getModel({ name: "My Model" }),
            usedBy: [q1, q2],
          });

          expect(screen.getByRole("link", { name: "Q1" })).toHaveAttribute(
            "href",
            q1.getUrl(),
          );
          expect(screen.getByRole("link", { name: "Q2" })).toHaveAttribute(
            "href",
            q2.getUrl(),
          );

          expect(
            screen.queryByText(/Create a new question/i),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText(/This model is not used by any questions yet/i),
          ).not.toBeInTheDocument();
        });
      });

      describe("schema section", () => {
        it("displays model schema", async () => {
          const model = getModel();
          const fields = model.getResultMetadata();
          await setup({ model });

          userEvent.click(screen.getByText("Schema"));

          expect(fields.length).toBeGreaterThan(0);
          expect(
            screen.getByText(`${fields.length} fields`),
          ).toBeInTheDocument();

          fields.forEach((field: Field) => {
            expect(screen.getByText(field.display_name)).toBeInTheDocument();
          });
        });
      });

      describe("read-only permissions", () => {
        const model = getModel({ can_write: false });

        it("doesn't allow to rename a model", async () => {
          await setup({ model });
          expect(
            screen.getByDisplayValue(model.displayName() as string),
          ).toBeDisabled();
        });

        it("doesn't allow to change description", async () => {
          await setup({ model });
          expect(screen.getByPlaceholderText("No description")).toBeDisabled();
        });

        it("doesn't show model management actions", async () => {
          await setup({ model });
          expect(queryIcon("ellipsis")).not.toBeInTheDocument();
          expect(screen.queryByText("Archive")).not.toBeInTheDocument();
          expect(screen.queryByText("Move")).not.toBeInTheDocument();
        });

        it("doesn't show a link to the query editor", async () => {
          await setup({ model });
          expect(screen.queryByText("Edit definition")).not.toBeInTheDocument();
        });

        it("doesn't show a link to the metadata editor", async () => {
          await setup({ model });
          userEvent.click(screen.getByText("Schema"));
          expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("structured model", () => {
    const model = getStructuredModel();

    it("displays backing table", async () => {
      await setup({ model });
      expect(screen.getByLabelText("Backing table")).toHaveTextContent(
        "Orders",
      );
    });

    it("displays related tables", async () => {
      await setup({ model });

      const list = within(screen.getByTestId("model-relationships"));

      expect(list.getByRole("link", { name: "Products" })).toHaveAttribute(
        "href",
        PRODUCTS.newQuestion().getUrl(),
      );
      expect(list.getByRole("link", { name: "People" })).toHaveAttribute(
        "href",
        PEOPLE.newQuestion().getUrl(),
      );
      expect(list.queryByText("Reviews")).not.toBeInTheDocument();
    });
  });

  describe("native model", () => {
    const model = getNativeModel();

    it("doesn't show backing table", async () => {
      await setup({ model });
      expect(screen.queryByLabelText("Backing table")).not.toBeInTheDocument();
    });

    it("doesn't show related tables", async () => {
      await setup({ model });
      expect(
        screen.queryByTestId("model-relationships"),
      ).not.toBeInTheDocument();
    });
  });
});
