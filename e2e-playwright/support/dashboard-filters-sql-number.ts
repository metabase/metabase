/**
 * Helpers for dashboard-filters-sql-number.spec.ts — a SQL-backed question with
 * two number template-tags (Price, Rating) connected to two dashboard number
 * filters (number/=). Fixture data + the create-and-connect setup are ported
 * from the Cypress spec's beforeEach.
 */
import type { MetabaseApi } from "./api";
import {
  createNativeQuestionAndDashboard,
  type DashboardDetails,
  type NativeQuestionDetails,
} from "./factories";

export const questionDetails: NativeQuestionDetails = {
  name: "Question 1",
  native: {
    query:
      "SELECT * from products where true [[ and price > {{price}}]] [[ and rating > {{rating}} ]] limit 5;",
    "template-tags": {
      price: {
        type: "number",
        name: "price",
        id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
        "display-name": "Price",
      },
      rating: {
        type: "number",
        name: "rating",
        id: "68821a54-f0f3-4f09-8c32-6f7c0e5e5399",
        "display-name": "Rating",
      },
    },
  },
};

export const filterDetails = [
  {
    name: "Rating",
    slug: "rating",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  },
  {
    name: "Price",
    slug: "price",
    id: "88b1a9dd",
    type: "number/=",
    sectionId: "number",
  },
];

export const parameterMapping = filterDetails.map((filter) => ({
  parameter_id: filter.id,
  target: ["variable", ["template-tag", filter.slug]],
}));

export const dashboardDetails: DashboardDetails = {
  name: "Dashboard #31975",
  parameters: filterDetails,
};

const dashcardDetails = {
  row: 0,
  col: 0,
  size_x: 16,
  size_y: 8,
};

/**
 * Port of the Cypress beforeEach body: create the native question + dashboard,
 * then PUT the dashcard back with the parameter_mappings and layout. Returns the
 * dashboard id to visit.
 */
export async function setupSqlNumberDashboard(
  api: MetabaseApi,
): Promise<number> {
  const { id, card_id, dashboard_id } = await createNativeQuestionAndDashboard(
    api,
    { questionDetails, dashboardDetails },
  );

  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        ...dashcardDetails,
        parameter_mappings: parameterMapping.map((mapping) => ({
          ...mapping,
          card_id,
        })),
      },
    ],
  });

  return dashboard_id;
}
