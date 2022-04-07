import React, { useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { State } from "metabase-types/store";

import { closeNavbar } from "metabase/redux/app";
import * as Urls from "metabase/lib/urls";
import {
  getHasDataAccess,
  getHasNativeWrite,
  getHasDbWithJsonEngine,
} from "metabase/new_query/selectors";

import { Menu, StyledButton, Title } from "./NewButton.styled";

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

interface NewButtonStateProps {
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDbWithJsonEngine: boolean;
}

interface NewButtonDispatchProps {
  closeNavbar: () => void;
}

interface NewButtonOwnProps {
  setModal: (modalName: string) => void;
}

interface NewButtonProps
  extends NewButtonOwnProps,
    NewButtonStateProps,
    NewButtonDispatchProps {}

const mapStateToProps: (state: State) => NewButtonStateProps = state => ({
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
}: NewButtonProps) {
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
        <StyledButton
          primary
          icon="add"
          iconSize={14}
          data-metabase-event="NavBar;Create Menu Click"
        >
          <Title>{t`New`}</Title>
        </StyledButton>
      }
      items={menuItems}
    />
  );
}

export default connect<
  NewButtonStateProps,
  NewButtonDispatchProps,
  NewButtonOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(NewButton);
