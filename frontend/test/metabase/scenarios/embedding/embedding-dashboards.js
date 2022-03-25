export const markdownCard = {
  virtual_card: {
    name: null,
    display: "text",
    visualization_settings: {},
    dataset_query: {},
    archived: false,
  },
  text: "# Our Awesome Analytics",
  "text.align_vertical": "middle",
  "text.align_horizontal": "center",
};

export const dateFilter = {
  name: "Month and Year",
  slug: "month_and_year",
  id: "7a1716b7",
  type: "date/month-year",
  sectionId: "date",
};

export const idFilter = {
  name: "ID",
  slug: "id",
  id: "ae4a4351",
  type: "id",
  sectionId: "id",
};

export const numericFilter = {
  name: "Greater than or equal to",
  slug: "greater_than_or_equal_to",
  id: "df770c16",
  type: "number/>=",
  sectionId: "number",
};

export const textFilter = {
  name: "Text",
  slug: "text",
  id: "d7e0814d",
  type: "string/=",
  sectionId: "string",
};

export function addCardToDashboard({ card_id, dashboard_id, card } = {}) {
  const url = `/api/dashboard/${dashboard_id}/cards`;

  return cy
    .request("POST", url, {
      cardId: card_id,
    })
    .then(({ body: { id } }) => {
      cy.request("PUT", url, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            sizeX: 8,
            sizeY: 8,
            visualization_settings: {},
            parameter_mappings: [],
            ...card,
          },
        ],
      });
    });
}
