/*
 * # Entities abstract the interface between the back-end and the front-end.
 *
 * ## Endpoint requirements for entities:
 *
 * When fetching a list, each item of the list must include an `id` key/value pair.
 *
 * JSON must wrap response inside a `{ "data" : { …your data } }` structure.
 *
 * ## Required Properties:
 *
 * name:
 *   a string in plural form
 *   examples:
 *     "questions", "dashboards"
 *
 * path:
 *   a uri
 *     starting with "/api/"
 *     conventionally followed by the entity name in singular form
 *   examples:
 *     "/api/card", "/api/dashboard"
 *
 * ## Optional properties:
 *
 * api:
 *
 * here you can override the basic entity methods like `list`, `create`, `get`, `update`, `delete` (OR see `path` below)
 *
 * schema:
 *   normalizr schema
 *   default:
 *     `new schema.Entity(entity.name)`
 *
 * ## How to create a bare-bones entity
 *
 * Say we want to create a "books" entity, to be able to fetch a list of "books".
 *
 * Add the following line to `frontend/src/metabase/entities.index.js`:
 *
 *   export { default as books } from "./books"
 *
 * Create file `frontend/src/metabase/entities/books.js`
 *
 * Add the following to it:
 *
 *   import { createEntity } from "./utils";

 *   const Books = createEntity({
 *     name: "books",
 *     nameOne: "book",
 *     path: "/api/book",
 *   });
 *
 *   export default Books;
 *
 * ## How to consume an entity:
 *
 * Near the top of a container file, import the entity:
 *
 *   import Book from "metabase/entities/books";
 *
 * Near the bottom of the container file, add the entity to a `compose` statement:
 *
 *   export default _.compose(
 *     Book.loadList(),
 *     connect(mapStateToProps),
 *   )(BookContainer);
 */

export { Actions as actions } from "./actions/actions";
export { Collections as collections } from "./collections";
export { SnippetCollections as snippetCollections } from "./snippet-collections";
export { Dashboards as dashboards } from "./dashboards";
export { Pulses as pulses } from "./pulses";
export { Questions as questions } from "./questions";
export { IndexedEntities as indexedEntities } from "./indexed-entities";

export { Timelines as timelines } from "./timelines";
export { TimelineEvents as timelineEvents } from "./timeline-events";

export { Bookmarks as bookmarks } from "./bookmarks";
export { Databases as databases } from "./databases";
export { Schemas as schemas } from "./schemas";
export { Tables as tables } from "./tables";
export { Fields as fields } from "./fields";
export { Segments as segments } from "./segments";
export { Measures as measures } from "./measures";
export { Metrics as metrics } from "./metrics";
export { Transforms as transforms } from "./transforms";

export { Groups as groups } from "./groups";

export { Search as search } from "./search";
export { PersistedModels as persistedModels } from "./persisted-models";
export { Snippets as snippets } from "./snippets";
export { Documents as documents } from "./documents";

export { entityCompatibleQuery, combineEntities } from "./utils";
