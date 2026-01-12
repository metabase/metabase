import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

export const DOCUMENT_WITH_TWO_CARDS = {
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Testing drag and drop functionality",
        },
      ],
      attrs: {
        _id: "1",
      },
    },
    {
      type: "resizeNode",
      attrs: {
        height: 350,
        minHeight: 280,
        _id: "2",
      },
      content: [
        {
          type: "cardEmbed",
          attrs: {
            id: ORDERS_QUESTION_ID,
            name: null,
            _id: "2a",
          },
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Some text between cards",
        },
      ],
      attrs: {
        _id: "3",
      },
    },
    {
      type: "resizeNode",
      attrs: {
        height: 350,
        minHeight: 280,
        _id: "4",
      },
      content: [
        {
          type: "cardEmbed",
          attrs: {
            id: ORDERS_COUNT_QUESTION_ID,
            name: null,
            _id: "4a",
          },
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        _id: "5",
      },
    },
  ],
  type: "doc",
};

export const DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS = {
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Advanced drag and drop scenarios",
        },
      ],
      attrs: {
        _id: "1",
      },
    },
    {
      type: "resizeNode",
      attrs: {
        height: 350,
        minHeight: 280,
        _id: "2",
      },
      content: [
        {
          type: "flexContainer",
          attrs: {
            _id: "2a",
          },
          content: [
            {
              type: "cardEmbed",
              attrs: {
                id: ORDERS_QUESTION_ID,
                name: null,
                _id: "2a1",
              },
            },
            {
              type: "cardEmbed",
              attrs: {
                id: ORDERS_COUNT_QUESTION_ID,
                name: null,
                _id: "2a2",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Standalone card below",
        },
      ],
      attrs: {
        _id: "3",
      },
    },
    {
      type: "resizeNode",
      attrs: {
        height: 350,
        minHeight: 280,
        _id: "4",
      },
      content: [
        {
          type: "cardEmbed",
          attrs: {
            id: ORDERS_BY_YEAR_QUESTION_ID,
            name: null,
            _id: "4a",
          },
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        _id: "5",
      },
    },
  ],
  type: "doc",
};

export const DOCUMENT_WITH_SUPPORTING_TEXT = {
  type: "doc",
  content: [
    {
      type: "resizeNode",
      attrs: {
        height: 350,
        minHeight: 280,
        _id: "1",
      },
      content: [
        {
          type: "flexContainer",
          attrs: {
            _id: "1a",
            columnWidths: [33.33333333333333, 66.66666666666666],
          },
          content: [
            {
              type: "supportingText",
              attrs: { _id: "1b" },
              content: [
                {
                  type: "paragraph",
                  attrs: { _id: "1c" },
                  content: [
                    {
                      type: "text",
                      text: "Lorem ipsum",
                    },
                  ],
                },
              ],
            },
            {
              type: "cardEmbed",
              attrs: {
                id: ORDERS_QUESTION_ID,
                name: null,
                _id: "2a2",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Standalone card below",
        },
      ],
      attrs: {
        _id: "3",
      },
    },
    {
      type: "resizeNode",
      attrs: {
        height: 350,
        minHeight: 280,
        _id: "4",
      },
      content: [
        {
          type: "cardEmbed",
          attrs: {
            id: ORDERS_COUNT_QUESTION_ID,
            name: null,
            _id: "4a",
          },
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        _id: "5",
      },
    },
  ],
};
