import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { dayjs } from "metabase/dayjs";

import {
  type DescribeActionFormResponse,
  TableActionFormInputType,
  type TableActionFormParameter,
} from "../../api/types";

import { CreateRowActionFormModal } from "./CreateRowActionFormModal";

function setup(parameters: TableActionFormParameter[]) {
  const description: DescribeActionFormResponse = {
    title: "Create a new record",
    parameters,
  };
  const onSubmit = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();

  renderWithProviders(
    <CreateRowActionFormModal
      opened
      description={description}
      isLoading={false}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );

  return { onSubmit, onClose };
}

describe("CreateRowActionFormModal", () => {
  describe("dropdown fields (WRK-907)", () => {
    const SEARCH_VALUE = "999999";

    it("does not offer to add a new value for a foreign key field", async () => {
      fetchMock.get("path:/api/field/201/search/201", []);
      setup([
        {
          id: "user_id",
          display_name: "User ID",
          input_type: TableActionFormInputType.Dropdown,
          semantic_type: "type/FK",
          field_id: 201,
          optional: true,
        },
      ]);

      await userEvent.click(screen.getByTestId("User ID-field-input"));
      await userEvent.type(
        await screen.findByPlaceholderText("Search the list"),
        SEARCH_VALUE,
      );

      expect(await screen.findByText("Nothing found")).toBeInTheDocument();
      expect(screen.queryByText(/Add option/)).not.toBeInTheDocument();
    });

    it("offers to add a new value for a category field", async () => {
      fetchMock.get("path:/api/field/202/search/202", []);
      setup([
        {
          id: "category",
          display_name: "Category",
          input_type: TableActionFormInputType.Dropdown,
          semantic_type: "type/Category",
          field_id: 202,
          optional: true,
        },
      ]);

      await userEvent.click(screen.getByTestId("Category-field-input"));
      await userEvent.type(
        await screen.findByPlaceholderText("Search the list"),
        SEARCH_VALUE,
      );

      expect(
        await screen.findByRole("option", {
          name: `Add option: ${SEARCH_VALUE}`,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Nothing found")).not.toBeInTheDocument();
    });
  });

  it("enables submit once a required date is picked (metabase#70647)", async () => {
    const { onSubmit } = setup([
      {
        id: "sale_date",
        display_name: "Sale Date",
        input_type: TableActionFormInputType.Date,
        optional: false,
      },
    ]);

    const submitButton = screen.getByTestId("create-row-form-submit-button");
    await waitFor(() => expect(submitButton).toBeDisabled());

    const targetDay = dayjs().date(15);
    await userEvent.click(screen.getByTestId("Sale Date-field-input"));
    await userEvent.click(
      await screen.findByRole("button", {
        name: targetDay.format("D MMMM YYYY"),
      }),
    );

    await waitFor(() => expect(submitButton).toBeEnabled());
    await userEvent.click(submitButton);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        sale_date: targetDay.format("YYYY-MM-DD"),
      }),
    );
  });
});
