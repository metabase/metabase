import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("document comments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("allows to comment on every node", () => {
    createLoremIpsumDocument();
  });
});

function createLoremIpsumDocument() {
  H.createDocument({
    idAlias: "documentId",
    name: "Lorem ipsum",
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
            _id: "c2187a62-1093-61ee-3174-0bbe64c8bbfa",
          },
          content: [
            {
              type: "text",
              text: "Heading 1",
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 2,
            _id: "82999d0b-d7a7-c0f8-aedf-6ddf737edf78",
          },
          content: [
            {
              type: "text",
              text: "Heading 2",
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 3,
            _id: "190b1dd2-d875-18ae-0ba0-a13c91630c2b",
          },
          content: [
            {
              type: "text",
              text: "Heading 3",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: {
            _id: "b7fa322a-964e-d668-8d30-c772ef4f0022",
          },
          content: [
            {
              type: "text",
              text: "Lorem ipsum dolor sit amet.",
            },
          ],
        },
        {
          type: "bulletList",
          attrs: {
            _id: "3fd94c59-614d-bce7-37ef-c2f46871679a",
          },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "d89a509c-0a03-3856-8e10-481a58797df1",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Bullet A",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "4080cc00-a884-af5d-8863-643a9490d5ae",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Bullet B",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "f2cb1cfe-5d39-f733-9122-bb5e5f876c17",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Bullet C",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          attrs: {
            _id: "e785b000-1651-c154-e0bd-7313f839bb50",
          },
          content: [
            {
              type: "paragraph",
              attrs: {
                _id: "0c48f302-cb8d-ca5b-9c6f-32a7b3723c53",
              },
              content: [
                {
                  type: "text",
                  text: "A famous quote",
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: {
            start: 1,
            type: null,
            _id: "12fd2bdb-76f7-d07a-b61e-b2d2eee127b5",
          },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "1b044a62-221e-0ee9-f68f-3a8e026c073d",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Item 1",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "53cb6ee7-6012-2fd6-61e1-5a4a22ba38d0",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Item 2",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "a3ba73b9-4f43-e1f6-4867-832fa0dc2df1",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Item 3",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: {
            language: null,
            _id: "b9fec4be-4b44-2c24-7073-10f23522cfd3",
          },
          content: [
            {
              type: "text",
              text: 'while (true) {\n  console.log("metabase");\n}',
            },
          ],
        },
        {
          type: "cardEmbed",
          attrs: {
            id: ORDERS_QUESTION_ID,
            name: null,
            _id: "cce109c3-4cec-caf1-a569-89fa15410ae1",
          },
        },
        {
          type: "paragraph",
          attrs: {
            _id: "b0ab4c7e-7802-c6f7-2708-0f63bdd0b129",
          },
        },
      ],
    },
  });

  H.visitDocument("@documentId");
}
