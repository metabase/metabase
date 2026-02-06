import userEvent from "@testing-library/user-event";

import {
  setupBillingEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PythonTransformsUpsellModal } from "./PythonTransformsUpsellModal";

const setup = ({
  isOpen = true,
  isHosted,
  isStoreUser,
  hasPythonProduct = true,
  billingPeriodMonths = 12,
}: {
  isOpen?: boolean;
  isHosted: boolean;
  isStoreUser: boolean;
  hasPythonProduct?: boolean;
  billingPeriodMonths?: number | undefined;
}) => {
  const onClose = jest.fn();

  const storeUserEmail = "store-user@example.com";
  const currentUser = createMockUser(
    isStoreUser ? { email: storeUserEmail } : undefined,
  );

  const settings = createMockSettings({
    "is-hosted?": isHosted,
    "token-status": {
      status: "valid",
      valid: true,
      "store-users": isStoreUser ? [{ email: storeUserEmail }] : [],
      features: [],
    },
    "token-features": createMockTokenFeatures({}),
  });

  const state = createMockState({
    settings: createMockSettingsState(settings),
    currentUser,
  });

  setupBillingEndpoints({
    billingPeriodMonths,
    hasBasicTransformsAddOn: false,
    hasAdvancedTransformsAddOn: hasPythonProduct,
  });
  setupPropertiesEndpoints(settings);

  renderWithProviders(
    <PythonTransformsUpsellModal isOpen={isOpen} onClose={onClose} />,
    {
      storeInitialState: state,
    },
  );

  return { onClose };
};

describe("PythonTransformsUpsellModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders single-column layout with admin message when hosted and user is not a store user", () => {
    setup({ isHosted: true, isStoreUser: false });

    expect(
      screen.getByRole("heading", {
        name: /Go beyond SQL with advanced transforms/,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Please ask a Metabase Store Admin to enable this for you/,
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: /Add advanced transforms to your plan/,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows cloud purchase content when hosted, store user, and billing data is available", async () => {
    setup({ isHosted: true, isStoreUser: true, hasPythonProduct: true });

    expect(
      screen.getByRole("heading", {
        name: /Add advanced transforms to your plan/,
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText(/SQL \+ Python/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Confirm purchase/ }),
    ).toBeInTheDocument();
  });

  it("falls back to upsell CTA when hosted and billing data is missing", () => {
    setup({ isHosted: true, isStoreUser: true, hasPythonProduct: false });

    return expect(
      screen.findByRole("button", { name: /Get Python transforms/ }),
    ).resolves.toBeInTheDocument();
  });

  it("shows upsell CTA when instance is not hosted and clicking it closes modal", async () => {
    const { onClose } = setup({ isHosted: false, isStoreUser: true });

    await screen.findByRole("button", { name: /Get Python transforms/ });

    await userEvent.click(
      screen.getByRole("button", { name: /Get Python transforms/ }),
    );

    expect(onClose).toHaveBeenCalled();
  });
});
