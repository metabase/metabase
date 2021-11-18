import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import EntityMenu from "metabase/components/EntityMenu";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

const propTypes = {
  collection: PropTypes.func,
  list: PropTypes.arrayOf(PropTypes.object),
};

function NewCollectionItemMenu({ collection }) {
  const items = [
    {
      icon: "insight",
      title: t`Question`,
      link: Urls.newQuestion({ mode: "notebook", collectionId: collection.id }),
      event: `${ANALYTICS_CONTEXT};New Item Menu;Question Click`,
    },
    {
      icon: "dashboard",
      title: t`Dashboard`,
      link: Urls.newDashboard(collection.id),
      event: `${ANALYTICS_CONTEXT};New Item Menu;Dashboard Click`,
    },
    {
      icon: "folder",
      title: t`Collection`,
      link: Urls.newCollection(collection.id),
      event: `${ANALYTICS_CONTEXT};New Item Menu;Collection Click`,
    },
  ];

  return <EntityMenu items={items} triggerIcon="add" tooltip={t`New…`} />;
}

NewCollectionItemMenu.propTypes = propTypes;

export default NewCollectionItemMenu;
