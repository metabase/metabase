import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";
import { FormProvider } from "metabase/forms";

import { SchemaFormSelect } from "./SchemaFormSelect";

function setup({
  initialValue = "",
  name = "schema",
  schemas = [],
  onSubmit = jest.fn(),
}: {
  initialValue?: string;
  name?: string;
  schemas?: string[];
  onSubmit?: (values: Record<string, string>) => void;
} = {}) {
  const initialValues = { [name]: initialValue };

  renderWithProviders(
    <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
      <SchemaFormSelect name={name} data={schemas} />
    </FormProvider>,
  );
}

describe("SchemaFormSelect", () => {
  it("should render existing schemas as options and filter them accordingly", async () => {
    setup({
      schemas: ["foo", "bar"],
    });

    const input = screen.getByRole("textbox");
    act(() => input.focus());

    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.queryByText(/Create new schema/)).not.toBeInTheDocument();

    await userEvent.type(input, "foo");
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.queryByText("bar")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("foo"));
    expect(input).toHaveValue("foo");

    expect(
      screen.queryByText(
        "This schema will be created the first time the transform runs.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should be possible to create new schemas", async () => {
    setup({
      schemas: ["foo", "bar"],
    });

    const input = screen.getByRole("textbox");
    act(() => input.focus());

    await userEvent.type(input, "fo");
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText(/Create new schema/)).toBeInTheDocument();

    await userEvent.click(screen.getByText(/Create new schema/));
    expect(input).toHaveValue("fo");

    expect(
      screen.getByText(
        "This schema will be created the first time the transform runs.",
      ),
    ).toBeInTheDocument();
  });

  it("should render initial value when it is an existing schema", async () => {
    setup({
      initialValue: "foo",
      schemas: ["foo", "bar"],
    });

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("foo");
    expect(
      screen.queryByText(
        "This schema will be created the first time the transform runs.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should render initial value when it is a new schema", async () => {
    setup({
      initialValue: "quu",
      schemas: ["foo", "bar"],
    });

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("quu");
    expect(
      screen.getByText(
        "This schema will be created the first time the transform runs.",
      ),
    ).toBeInTheDocument();
  });
});
