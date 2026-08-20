import {
  type RouteObject,
  redirect,
  registerPagePrefetch,
} from "metabase/router";

/**
 * The reference section, in its own chunk.
 *
 * This module holds paths and `import()` calls and nothing else, so the route
 * tree can name it eagerly while none of the pages are in the initial bundle.
 * They are fetched the first time one of these routes is matched.
 */
const databaseList = () =>
  import("./databases/DatabaseListContainer").then((module) => ({
    Component: module.default,
  }));

const databaseDetail = () =>
  import("./databases/DatabaseDetailContainer").then((module) => ({
    Component: module.default,
  }));

const tableList = () =>
  import("./databases/TableListContainer").then((module) => ({
    Component: module.default,
  }));

const tableDetail = () =>
  import("./databases/TableDetailContainer").then((module) => ({
    Component: module.default,
  }));

const tableQuestions = () =>
  import("./databases/TableQuestionsContainer").then((module) => ({
    Component: module.default,
  }));

const fieldList = () =>
  import("./databases/FieldListContainer").then((module) => ({
    Component: module.default,
  }));

const fieldDetail = () =>
  import("./databases/FieldDetailContainer").then((module) => ({
    Component: module.default,
  }));

const segmentList = () =>
  import("./segments/SegmentListContainer").then((module) => ({
    Component: module.default,
  }));

const segmentDetail = () =>
  import("./segments/SegmentDetailContainer").then((module) => ({
    Component: module.default,
  }));

const segmentFieldList = () =>
  import("./segments/SegmentFieldListContainer").then((module) => ({
    Component: module.default,
  }));

const segmentFieldDetail = () =>
  import("./segments/SegmentFieldDetailContainer").then((module) => ({
    Component: module.default,
  }));

const segmentQuestions = () =>
  import("./segments/SegmentQuestionsContainer").then((module) => ({
    Component: module.default,
  }));

const segmentRevisions = () =>
  import("./segments/SegmentRevisionsContainer").then((module) => ({
    Component: module.default,
  }));

const glossary = () =>
  import("./glossary/GlossaryContainer").then(({ GlossaryContainer }) => ({
    Component: GlossaryContainer,
  }));

/**
 * The three pages the app links to from outside the section. Hovering one of
 * those links starts the fetch. Everything below them is reached from inside
 * the section, by which time the chunk is already there.
 */
registerPagePrefetch("/reference/databases", databaseList);
registerPagePrefetch("/reference/segments", segmentList);
registerPagePrefetch("/reference/glossary", glossary);

export function getReferenceRoutes(): RouteObject[] {
  return [
    {
      path: "/reference",
      children: [
        { index: true, element: redirect("/reference/databases") },

        { path: "segments", lazy: segmentList },
        { path: "segments/:segmentId", lazy: segmentDetail },
        { path: "segments/:segmentId/fields", lazy: segmentFieldList },
        {
          path: "segments/:segmentId/fields/:fieldId",
          lazy: segmentFieldDetail,
        },
        { path: "segments/:segmentId/questions", lazy: segmentQuestions },
        { path: "segments/:segmentId/revisions", lazy: segmentRevisions },

        { path: "databases", lazy: databaseList },
        { path: "databases/:databaseId", lazy: databaseDetail },
        { path: "databases/:databaseId/tables", lazy: tableList },
        { path: "databases/:databaseId/tables/:tableId", lazy: tableDetail },
        {
          path: "databases/:databaseId/tables/:tableId/fields",
          lazy: fieldList,
        },
        {
          path: "databases/:databaseId/tables/:tableId/fields/:fieldId",
          lazy: fieldDetail,
        },
        {
          path: "databases/:databaseId/tables/:tableId/questions",
          lazy: tableQuestions,
        },

        { path: "glossary", lazy: glossary },
      ],
    },
  ];
}
