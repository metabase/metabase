/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { closeNavbar } from "metabase/redux/app";
import * as Urls from "metabase/lib/urls";
import {
  getHasDataAccess,
  getHasNativeWrite,
  getHasDbWithJsonEngine,
} from "metabase/new_query/selectors";
import { getUser } from "../../selectors";

import { Menu, ButtonLink, Title } from "./NewButton.styled";

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

const mapStateToProps = state => ({
  user: getUser(state),
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDbWithJsonEngine: getHasDbWithJsonEngine(state),
});

const mapDispatchToProps = {
  closeNavbar,
};

function NewButton({
  hasDataAccess,
  hasNativeWrite,
  hasDbWithJsonEngine,
  setModal,
  closeNavbar,
}) {
  const menuItems = useMemo(() => {
    const items = [];

    if (hasDataAccess) {
      items.push({
        title: t`Question`,
        icon: "insight",
        link: Urls.newQuestion({
          mode: "notebook",
          creationType: "custom_question",
        }),
        event: "NavBar;New Question Click;",
        onClose: closeNavbar,
      });
    }

    if (hasNativeWrite) {
      items.push({
        title: hasDbWithJsonEngine ? t`Native query` : t`SQL query`,
        icon: "sql",
        link: Urls.newQuestion({
          type: "native",
          creationType: "native_question",
        }),
        event: "NavBar;New SQL Query Click;",
        onClose: closeNavbar,
      });
    }

    items.push(
      {
        title: t`Dashboard`,
        icon: "dashboard",
        action: () => setModal(MODAL_NEW_DASHBOARD),
        event: "NavBar;New Dashboard Click;",
      },
      {
        title: t`Collection`,
        icon: "folder",
        action: () => setModal(MODAL_NEW_COLLECTION),
        event: "NavBar;New Collection Click;",
      },
    );

    return items;
  }, [
    hasDataAccess,
    hasNativeWrite,
    hasDbWithJsonEngine,
    closeNavbar,
    setModal,
  ]);

  return (
    <Menu
      trigger={
        <ButtonLink
          className="Button Button--primary"
          data-metabase-event="NavBar;Create Menu Click"
        >
          <Icon name="add" size={14} />
          <Title>{t`New`}</Title>
        </ButtonLink>
      }
      items={menuItems}
    />
  );
}

export default connect(mapStateToProps, mapDispatchToProps)(NewButton);
