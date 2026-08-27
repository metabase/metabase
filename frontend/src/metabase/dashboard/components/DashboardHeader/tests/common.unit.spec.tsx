import { waitFor } from "@testing-library/react";

import { findRequests } from "__support__/server-mocks";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";

import { setup } from "./setup";

async function getFormInputRequests() {
  const gets = await findRequests("GET");
  return gets.filter((req) =>
    req.url.match(new RegExp("/api/pulse/form_input$")),
  );
}

describe("DashboardHeader", () => {
  describe("pulse form_input request (EMB-967)", () => {
    it("should fetch pulse form_input when user can manage subscriptions", async () => {
      await setup({ isAdmin: true, email: true });

      await waitFor(async () => {
        expect(await getFormInputRequests()).toHaveLength(1);
      });
    });

    it("should not fetch pulse form_input when user cannot manage subscriptions", async () => {
      const original =
        PLUGIN_APPLICATION_PERMISSIONS.selectors.canManageSubscriptions;
      PLUGIN_APPLICATION_PERMISSIONS.selectors.canManageSubscriptions = () =>
        false;

      try {
        await setup({ isAdmin: false, email: true });

        // Wait for the component to finish mounting, then verify no request was made
        await waitFor(async () => {
          const requests = await getFormInputRequests();
          expect(requests).toHaveLength(0);
        });
      } finally {
        PLUGIN_APPLICATION_PERMISSIONS.selectors.canManageSubscriptions =
          original;
      }
    });
  });
});
