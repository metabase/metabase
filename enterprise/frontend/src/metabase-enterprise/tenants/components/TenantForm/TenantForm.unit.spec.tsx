import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Tenant } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { TenantForm } from "./TenantForm";

interface SetupOpts {
  initialValues?: Partial<Tenant>;
}

const setup = ({ initialValues = {} }: SetupOpts = {}) => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();

  renderWithProviders(
    <TenantForm
      initialValues={initialValues}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitText="Create tenant"
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ tenants: true }),
        }),
      }),
    },
  );

  return { onSubmit };
};

const getNameInput = () =>
  screen.getByRole("textbox", { name: "Give this tenant a name" });

const getSlugInput = () =>
  screen.getByRole("textbox", { name: "Slug for this tenant" });

describe("TenantForm", () => {
  describe("new tenant", () => {
    it("fills the slug in from the name", async () => {
      setup();

      await userEvent.type(getNameInput(), "Parrot");

      expect(getSlugInput()).toHaveValue("parrot");
    });

    it("slugifies a name that is not already slug shaped", async () => {
      setup();

      await userEvent.type(getNameInput(), "Acme Corp!");

      expect(getSlugInput()).toHaveValue("acme_corp");
    });

    it("stops following the name once the slug is edited by hand", async () => {
      setup();

      await userEvent.type(getNameInput(), "Parrot");
      await userEvent.clear(getSlugInput());
      await userEvent.type(getSlugInput(), "birdhouse");
      await userEvent.type(getNameInput(), " the second");

      expect(getSlugInput()).toHaveValue("birdhouse");
    });

    it("submits the name and the slug", async () => {
      const { onSubmit } = setup();

      await userEvent.type(getNameInput(), "Parrot");
      await userEvent.click(
        screen.getByRole("button", { name: "Create tenant" }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Parrot", slug: "parrot" }),
          expect.anything(),
        );
      });
    });
  });

  describe("existing tenant", () => {
    const existingTenant = { id: 3, name: "Turkey", slug: "turkey" };

    it("freezes the slug, which cannot be changed after creation", () => {
      setup({ initialValues: existingTenant });

      expect(getNameInput()).toHaveValue("Turkey");
      expect(getSlugInput()).toHaveValue("turkey");
      expect(getSlugInput()).toBeDisabled();
    });

    it("leaves the frozen slug alone when the name is renamed", async () => {
      setup({ initialValues: existingTenant });

      await userEvent.clear(getNameInput());
      await userEvent.type(getNameInput(), "Chicken");

      expect(getSlugInput()).toHaveValue("turkey");
    });
  });
});
