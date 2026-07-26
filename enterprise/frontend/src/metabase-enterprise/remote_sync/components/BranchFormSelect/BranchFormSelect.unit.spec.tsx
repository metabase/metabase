import userEvent from "@testing-library/user-event";
import { useFormikContext } from "formik";

import { renderWithProviders, screen } from "__support__/ui";
import { Form, FormProvider } from "metabase/forms";

import { BranchFormSelect } from "./BranchFormSelect";

type Values = { branch: string | null };

function SelectedValue() {
  const { values } = useFormikContext<Values>();
  return <div data-testid="selected-branch">{values.branch ?? ""}</div>;
}

function setup({
  branches = ["main", "develop", "feature/one"],
  initialBranch = null,
}: { branches?: string[]; initialBranch?: string | null } = {}) {
  renderWithProviders(
    <FormProvider
      initialValues={{ branch: initialBranch }}
      onSubmit={jest.fn()}
    >
      <Form>
        <BranchFormSelect name="branch" branches={branches} />
        <SelectedValue />
      </Form>
    </FormProvider>,
  );
}

const getSelected = () => screen.getByTestId("selected-branch").textContent;

describe("BranchFormSelect", () => {
  it("lists the provided branches as options", async () => {
    setup();
    await userEvent.click(screen.getByLabelText(/Branch/));

    for (const branch of ["main", "develop", "feature/one"]) {
      expect(
        await screen.findByRole("option", { name: branch }),
      ).toBeInTheDocument();
    }
  });

  it("selects an existing branch", async () => {
    setup();
    await userEvent.click(screen.getByLabelText(/Branch/));
    await userEvent.click(
      await screen.findByRole("option", { name: "develop" }),
    );

    expect(getSelected()).toBe("develop");
  });

  it("offers a creatable option for a typed, non-matching branch", async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/Branch/), "feature/new");

    expect(
      await screen.findByRole("option", {
        name: /Create branch "feature\/new"/,
      }),
    ).toBeInTheDocument();
    // No help text explaining the creatable behavior.
    expect(screen.queryByText(/will be created/i)).not.toBeInTheDocument();
  });

  it("does not offer a creatable option when the typed value matches an existing branch", async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/Branch/), "develop");

    expect(
      screen.queryByRole("option", { name: /Create branch/ }),
    ).not.toBeInTheDocument();
  });

  it("selects a newly entered branch via the creatable option", async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/Branch/), "feature/new");
    await userEvent.click(
      await screen.findByRole("option", {
        name: /Create branch "feature\/new"/,
      }),
    );

    expect(getSelected()).toBe("feature/new");
  });
});
