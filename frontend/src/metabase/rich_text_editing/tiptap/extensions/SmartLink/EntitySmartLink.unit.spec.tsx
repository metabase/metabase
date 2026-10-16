import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupMeasureEndpoint,
  setupSegmentEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockMeasure,
  createMockSegment,
  createMockSettings,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SuggestionModel } from "../shared/types";

import { EntitySmartLink, type EntitySmartLinkProps } from "./EntitySmartLink";

const LABEL = "the label";
const PUBLISHED_TABLE_ID = 5;
const UNPUBLISHED_TABLE_ID = 6;

const publishedTable = createMockTable({
  id: PUBLISHED_TABLE_ID,
  db_id: 1,
  display_name: "Orders",
  is_published: true,
  collection: createMockCollection({ id: 10, type: "library-data" }),
});
const unpublishedTable = createMockTable({
  id: UNPUBLISHED_TABLE_ID,
  db_id: 1,
  display_name: "Products",
  is_published: false,
});
const libraryMetric = createMockCard({
  id: 20,
  name: "ARR",
  type: "metric",
  collection: createMockCollection({ id: 11, type: "library-metrics" }),
});
const regularMetric = createMockCard({
  id: 21,
  name: "Churn",
  type: "metric",
  collection: createMockCollection({ id: 12, name: "Finance" }),
});
const model = createMockCard({
  id: 30,
  name: "Orders + People",
  type: "model",
});
const measure = createMockMeasure({
  id: 40,
  name: "Sum of Total",
  table_id: PUBLISHED_TABLE_ID,
});
const segment = createMockSegment({
  id: 50,
  name: "EU Customers",
  table_id: PUBLISHED_TABLE_ID,
});

const setup = (props: Pick<EntitySmartLinkProps, "id" | "model" | "href">) => {
  setupEnterpriseOnlyPlugin("library");
  setupTableEndpoints(publishedTable);
  setupTableEndpoints(unpublishedTable);
  setupCardEndpoints(libraryMetric);
  setupCardEndpoints(regularMetric);
  setupCardEndpoints(model);
  setupMeasureEndpoint(measure);
  setupSegmentEndpoint(segment);

  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ library: true }),
  });

  renderWithProviders(<EntitySmartLink name={LABEL} {...props} />, {
    storeInitialState: createMockState({ settings: mockSettings(settings) }),
  });
};

const findSmartLink = async (kind: "token" | "link") => {
  const link = await screen.findByTestId("smart-link");
  await waitFor(() => expect(link).toHaveAttribute("data-smart-link", kind));
  return link;
};

describe("EntitySmartLink", () => {
  it.each<{
    entity: string;
    id: number;
    model: SuggestionModel;
    kind: "token" | "link";
    name: string;
    href: string;
  }>([
    {
      entity: "published table",
      id: PUBLISHED_TABLE_ID,
      model: "table",
      kind: "token",
      name: "Orders",
      href: "/table/5-orders",
    },
    {
      entity: "unpublished table",
      id: UNPUBLISHED_TABLE_ID,
      model: "table",
      kind: "link",
      name: "Products",
      href: "/table/6-products",
    },
    {
      entity: "Library metric",
      id: libraryMetric.id,
      model: "metric",
      kind: "token",
      name: "ARR",
      href: "/metric/20",
    },
    {
      entity: "metric outside the Library",
      id: regularMetric.id,
      model: "metric",
      kind: "link",
      name: "Churn",
      href: "/metric/21",
    },
    {
      entity: "model",
      id: model.id,
      model: "dataset",
      kind: "link",
      name: "Orders + People",
      href: "/model/30-orders-people",
    },
    {
      entity: "measure on a published table",
      id: measure.id,
      model: "measure",
      kind: "token",
      name: "Sum of Total",
      href: "/data-studio/library/tables/5/measures/40",
    },
    {
      entity: "segment on a published table",
      id: segment.id,
      model: "segment",
      kind: "token",
      name: "EU Customers",
      href: "/question#?db=1&table=5&segment=50",
    },
  ])(
    "renders a $entity as a $kind",
    async ({ id, model, kind, name, href }) => {
      setup({ id, model });

      const link = await findSmartLink(kind);
      const isToken = kind === "token";

      // tokens show the asset's own name; links keep the text they were written with
      expect(link).toHaveTextContent(isToken ? name : LABEL);
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(within(link).queryByRole("img") !== null).toBe(isToken);
    },
  );

  it("keeps the given href when the entity cannot be loaded", async () => {
    fetchMock.get("path:/api/dashboard/999", 404);
    setup({ id: 999, model: "dashboard", href: "/dashboard/999" });

    const link = await findSmartLink("link");
    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/dashboard/999")).toBe(
        true,
      ),
    );
    expect(link).toHaveTextContent(LABEL);
    expect(link).toHaveAttribute("href", "/dashboard/999");
  });
});
