/* @flow */

import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";

// import visualizations from "metabase/visualizations";

const Questions = createEntity({
  name: "questions",
  path: "/api/card",

  objectActions: {
    setArchived: ({ id }, archived) =>
      Questions.actions.update({ id, archived }),
    setCollection: ({ id }, collection) =>
      Questions.actions.update({
        id,
        collection_id: collection && collection.id,
      }),
    pin: ({ id }) => Questions.actions.update({ id, collection_position: 1 }),
    unpin: ({ id }) =>
      Questions.actions.update({ id, collection_position: null }),
    setFavorited: ({ id }, favorited) =>
      Questions.actions.update({
        id,
        favorited,
      }),
  },

  objectSelectors: {
    getFavorited: question => question && question.favorited,
    getName: question => question && question.name,
    getUrl: question => question && Urls.question(question.id),
    getColor: () => "#93B3C9",
    getIcon: question => "beaker",
    // (require("metabase/visualizations").default.get(question.display) || {})
    //   .iconName || "question",
  },

  form: {
    fields: [{ name: "name" }, { name: "description", type: "text" }],
  },
});

export default Questions;
