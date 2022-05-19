import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { newQuestion, newDashboard, newCollection } from "metabase/lib/urls";

import EntityMenu from "metabase/components/EntityMenu";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

const propTypes = {
  collection: PropTypes.object,
  list: PropTypes.arrayOf(PropTypes.object),
  canCreateQuestions: PropTypes.bool,
};

function NewCollectionItemMenu({ collection, canCreateQuestions }) {
  const items = [
    canCreateQuestions && {
      icon: "insight",
      title: t`Question`,
      link: newQuestion({ mode: "notebook", collectionId: collection.id }),
      event: `${ANALYTICS_CONTEXT};New Item Menu;Question Click`,
    },
    {
      icon: "dashboard",
      title: t`Dashboard`,
      link: newDashboard(collection.id),
      event: `${ANALYTICS_CONTEXT};New Item Menu;Dashboard Click`,
    },
    {
      icon: "folder",
      title: t`Collection`,
      link: newCollection(collection.id),
      event: `${ANALYTICS_CONTEXT};New Item Menu;Collection Click`,
    },
  ].filter(Boolean);

  return <EntityMenu items={items} triggerIcon="add" tooltip={t`New…`} />;
}

NewCollectionItemMenu.propTypes = propTypes;

export default NewCollectionItemMenu;
