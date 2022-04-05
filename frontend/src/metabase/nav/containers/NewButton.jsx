/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import EntityMenu from "metabase/components/EntityMenu";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import { closeNavbar } from "metabase/redux/app";
import * as Urls from "metabase/lib/urls";

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

import { getUser } from "../selectors";
import {
  getHasDataAccess,
  getHasNativeWrite,
  getHasDbWithJsonEngine,
} from "metabase/new_query/selectors";

function NewButton({
  hasDataAccess,
  hasNativeWrite,
  hasDbWithJsonEngine,
  setModal,
  closeNavbar,
}) {
  return (
    <EntityMenu
      className="hide sm-show mr1"
      trigger={
        <Link
          mr={1}
          p={1}
          className="Button Button--primary flex align-center"
          data-metabase-event={`NavBar;Create Menu Click`}
        >
          <Icon name="add" size={14} />
          <h4 className="hide sm-show ml1 text-nowrap">{t`New`}</h4>
        </Link>
      }
      items={[
        ...(hasDataAccess
          ? [
              {
                title: t`Question`,
                icon: `insight`,
                link: Urls.newQuestion({
                  mode: "notebook",
                  creationType: "custom_question",
                }),
                event: `NavBar;New Question Click;`,
                onClose: closeNavbar,
              },
            ]
          : []),
        ...(hasNativeWrite
          ? [
              {
                title: hasDbWithJsonEngine ? t`Native query` : t`SQL query`,
                icon: `sql`,
                link: Urls.newQuestion({
                  type: "native",
                  creationType: "native_question",
                }),
                event: `NavBar;New SQL Query Click;`,
                onClose: closeNavbar,
              },
            ]
          : []),
        {
          title: t`Dashboard`,
          icon: `dashboard`,
          action: () => setModal(MODAL_NEW_DASHBOARD),
          event: `NavBar;New Dashboard Click;`,
        },
        {
          title: t`Collection`,
          icon: `folder`,
          action: () => setModal(MODAL_NEW_COLLECTION),
          event: `NavBar;New Collection Click;`,
        },
      ]}
    />
  );
}

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDbWithJsonEngine: getHasDbWithJsonEngine(state, props),
});

const mapDispatchToProps = {
  closeNavbar,
};

export default connect(mapStateToProps, mapDispatchToProps)(NewButton);
