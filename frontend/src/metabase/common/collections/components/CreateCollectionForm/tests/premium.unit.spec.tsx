import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ official_collections: true }),
    enterprisePlugins: ["collections"],
  });
};

describe("CreateCollectionForm", () => {
  it("shows authority level controls", () => {
    setupPremium();
    expect(screen.getByText("Collection type")).toBeInTheDocument();
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
  });

  it("does not show authority level controls when the user is not an admin", () => {
    setupPremium({ user: createMockUser({ is_superuser: false }) });
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
    expect(screen.queryByText("Regular")).not.toBeInTheDocument();
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
  });

  it("does not show authority level controls when showAuthorityLevelPicker is false", () => {
    setupPremium({ showAuthorityLevelPicker: false });
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
    expect(screen.queryByText("Regular")).not.toBeInTheDocument();
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
  });

  describe("inside personal collections (metabase#30236)", () => {
    it.each([
      {
        description: "a personal collection",
        initialCollectionProps: {
          name: "Bobby Tables's Personal Collection",
          personal_owner_id: 1,
          is_personal: true,
        },
      },
      {
        description: "a personal collection child",
        initialCollectionProps: {
          name: "Personal collection child",
          personal_owner_id: undefined,
          is_personal: true,
        },
      },
    ])(
      "shows authority level controls and submits to $description",
      async ({ initialCollectionProps }) => {
        const onSubmit = jest.fn();
        setupPremium({
          user: createMockUser({
            is_superuser: true,
            personal_collection_id: 7,
          }),
          initialCollectionId: 7,
          initialCollectionProps,
          onSubmit,
        });

        expect(
          await screen.findByText(initialCollectionProps.name),
        ).toBeInTheDocument();
        expect(screen.getByText("Collection type")).toBeInTheDocument();
        expect(screen.getByText("Regular")).toBeInTheDocument();
        expect(screen.getByText("Official")).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText("Name"), "Child");
        await userEvent.click(screen.getByText("Official"));
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() =>
          expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "Child",
              parent_id: 7,
              authority_level: "official",
            }),
          ),
        );
      },
    );
  });
});
