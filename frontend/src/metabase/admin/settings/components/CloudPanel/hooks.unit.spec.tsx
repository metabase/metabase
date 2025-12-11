import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useGetStoreUrl } from "./hooks";

const Component = () => {
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );
  const url = useGetStoreUrl(plan);
  return <>{url}</>;
};

describe("CloudPanel > hooks", () => {
  describe("useGetStoreUrl", () => {
    it("returns `/login` for `pro-self-hosted` plan", () => {
      renderWithProviders(<Component />, {
        storeInitialState: createMockState({
          settings: mockSettings(
            createMockSettings({
              "token-features": createMockTokenFeatures({
                hosting: false,
                advanced_permissions: true,
              }),
            }),
          ),
        }),
      });

      expect(
        screen.getByText("https://store.staging.metabase.com/login"),
      ).toBeInTheDocument();
    });

    it("returns `/checkout` for non-`pro-self-hosted` plan", () => {
      renderWithProviders(<Component />, {
        storeInitialState: createMockState({
          settings: mockSettings(
            createMockSettings({
              "token-features": createMockTokenFeatures({
                hosting: true,
                advanced_permissions: true,
              }),
            }),
          ),
        }),
      });

      expect(
        screen.getByText("https://store.staging.metabase.com/checkout"),
      ).toBeInTheDocument();
    });
  });
});
