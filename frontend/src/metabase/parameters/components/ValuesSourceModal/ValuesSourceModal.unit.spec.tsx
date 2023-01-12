import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockField,
  createMockFieldValues,
} from "metabase-types/api/mocks";
import {
  setupCollectionsEndpoints,
  setupFieldValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import Field from "metabase-lib/metadata/Field";
import { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ValuesSourceModal from "./ValuesSourceModal";

describe("ValuesSourceModal", () => {
  describe("fields source", () => {
    it("should show a message about not connected fields", async () => {
      setup();

      expect(
        await screen.findByText(/You haven’t connected a field/),
      ).toBeInTheDocument();
    });

    it("should a message about missing field values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [new Field(createMockField())],
        }),
      });

      expect(
        await screen.findByText(/We don’t have any cached values/),
      ).toBeInTheDocument();
    });

    it("should show mapped fields values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [new Field(createMockField())],
        }),
      });

      expect(await screen.findByDisplayValue(/Gadget/)).toBeInTheDocument();
    });
  });

  describe("list source", () => {
    it("should set static list values", () => {
      const { onSubmit } = setup();

      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      userEvent.type(screen.getByRole("textbox"), "Gadget\nWidget");
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onSubmit).toHaveBeenCalledWith("static-list", {
        values: ["Gadget", "Widget"],
      });
    });
  });
});

interface SetupOpts {
  parameter?: UiParameter;
  hasFieldValues?: boolean;
}

const setup = ({
  parameter = createMockUiParameter(),
  hasFieldValues,
}: SetupOpts = {}) => {
  const scope = nock(location.origin);
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupCollectionsEndpoints(scope, [
    createMockCollection({
      id: "root",
      name: "Our analytics",
    }),
  ]);

  setupFieldValuesEndpoints(
    scope,
    createMockFieldValues({
      values: hasFieldValues ? [["Gadget"], ["Widget"]] : [],
    }),
  );

  renderWithProviders(
    <ValuesSourceModal
      parameter={parameter}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );

  return { onSubmit };
};
