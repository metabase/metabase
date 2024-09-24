/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import * as React from "react";
import { t } from "ttag";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/collections/utils";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import Search from "metabase/entities/search";
import SnippetCollections from "metabase/entities/snippet-collections";
import Snippets from "metabase/entities/snippets";
import { color } from "metabase/lib/colors";
import {
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS_CONTROLS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
} from "metabase/plugins";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { Icon } from "metabase/ui";

import { ArchivedSnippets } from "../ArchivedSnippets";
import { SnippetSidebarRow } from "../SnippetSidebarRow";

import {
  AddSnippetIcon,
  HideSearchIcon,
  MenuIconContainer,
  SearchSnippetIcon,
  SidebarFooter,
  SidebarIcon,
  SnippetTitle,
} from "./SnippetSidebar.styled";
import { useState } from "react";

const ICON_SIZE = 16;
const HEADER_ICON_SIZE = 16;
const MIN_SNIPPETS_FOR_SEARCH = 15;

type SnippetSidebarInnerProps = {
  onClose: any;
  setModalSnippet: any;
  openSnippetModalWithSelectedText: any;
  insertSnippet: any;
};

export const SnippetSidebarInner2 = ({
  snippets,
  openSnippetModalWithSelectedText,
  snippetCollection,
  search,
  onClose,
  setModalSnippet,
  insertSnippet,
  snippetCollections,
  setSnippetCollectionId,
  user,
  canWrite,
}: SnippetSidebarInnerProps) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchString, setSearchString] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const {
    permissionsModalCollectionId,
    setPermissionsModalCollectionId,
    modalSnippetCollection,
    setModalSnippetCollection,
  } = PLUGIN_SNIPPET_SIDEBAR_MODALS_CONTROLS.useControls?.() ?? {};

  const searchBox = React.useRef<HTMLInputElement>(null);

  const handleShowSearch = () => {
    setShowSearch(true);
    searchBox.current?.focus();
  };

  const handleHideSearch = () => {
    setShowSearch(false);
  };

  const footer = () => (
    <SidebarFooter onClick={() => setShowArchived(false)}>
      <SidebarIcon name="view_archive" size={ICON_SIZE} />
      {t`Archived snippets`}
    </SidebarFooter>
  );

  if (showArchived) {
    return <ArchivedSnippets onBack={() => setShowArchived(false)} />;
  }

  const displayedItems = showSearch
    ? snippets.filter(snippet =>
        snippet.name.toLowerCase().includes(searchString.toLowerCase()),
      )
    : _.sortBy(search, "model"); // relies on "collection" sorting before "snippet";

  return (
    <SidebarContent footer={footer()}>
      {!showSearch &&
      displayedItems.length === 0 &&
      snippetCollection.id === "root" ? (
        <div className={cx(CS.px3, CS.flex, CS.flexColumn, CS.alignCenter)}>
          <svg
            viewBox="0 0 10 10"
            className={CS.mb2}
            style={{ width: "25%", marginTop: 120 }}
          >
            <path
              style={{ stroke: color("bg-medium"), strokeWidth: 1 }}
              d="M0,1H8M0,3H10M0,5H7M0,7H10M0,9H3"
            />
          </svg>
          <h4
            className={CS.textMedium}
          >{t`Snippets are reusable bits of SQL`}</h4>
          <button
            onClick={openSnippetModalWithSelectedText}
            className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
            style={{ marginTop: 80 }}
          >{t`Create a snippet`}</button>
        </div>
      ) : (
        <div>
          <div
            className={cx(CS.flex, CS.alignCenter, CS.pl3, CS.pr2)}
            style={{ paddingTop: 10, paddingBottom: 11 }}
          >
            <div className={CS.flexFull}>
              <div
                /* Hide the search input by collapsing dimensions rather than `display: none`.
                                                                         This allows us to immediately focus on it when showSearch is set to true.*/
                style={showSearch ? {} : { width: 0, height: 0 }}
                className={cx(CS.textHeavy, CS.h3, CS.overflowHidden)}
              >
                <input
                  className={cx(CS.input, CS.inputBorderless, CS.p0)}
                  ref={searchBox}
                  onChange={e => setSearchString(e.target.value)}
                  value={searchString}
                  onKeyDown={e => {
                    if (e.key === "Escape") {
                      handleHideSearch();
                    }
                  }}
                />
              </div>
              <span
                className={cx({ [CS.hide]: showSearch }, CS.textHeavy, CS.h3)}
              >
                {snippetCollection.id === "root" ? (
                  t`Snippets`
                ) : (
                  <SnippetTitle
                    onClick={() => {
                      const parentId = snippetCollection.parent_id;
                      setSnippetCollectionId(
                        // if this collection's parent isn't in the list, we don't have perms to see it, return to the root instead
                        snippetCollections.some(
                          sc =>
                            canonicalCollectionId(sc.id) ===
                            canonicalCollectionId(parentId),
                        )
                          ? parentId
                          : null,
                      );
                    }}
                  >
                    <Icon name="chevronleft" className={CS.mr1} />
                    {snippetCollection.name}
                  </SnippetTitle>
                )}
              </span>
            </div>
            <div
              className={cx(
                CS.flexAlignRight,
                CS.flex,
                CS.alignCenter,
                CS.textMedium,
                CS.noDecoration,
              )}
            >
              {PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.map(HeaderButton => (
                <HeaderButton
                  key="asdf"
                  className={CS.mr2}
                  snippetCollection={snippetCollection}
                  user={user}
                  setPermissionsModalCollectionId={
                    setPermissionsModalCollectionId
                  }
                  setModalSnippetCollection={setModalSnippetCollection}
                />
              ))}
              {snippets.length >= MIN_SNIPPETS_FOR_SEARCH && (
                <SearchSnippetIcon
                  name="search"
                  size={HEADER_ICON_SIZE}
                  isHidden={showSearch}
                  onClick={handleShowSearch}
                />
              )}

              {snippetCollection.can_write && (
                <TippyPopoverWithTrigger
                  triggerClasses="flex"
                  triggerContent={
                    <AddSnippetIcon
                      name="add"
                      size={HEADER_ICON_SIZE}
                      isHidden={showSearch}
                    />
                  }
                  placement="bottom-end"
                  popoverContent={({ closePopover }) => (
                    <div className={cx(CS.flex, CS.flexColumn)}>
                      {[
                        {
                          icon: "snippet",
                          name: t`New snippet`,
                          onClick: openSnippetModalWithSelectedText,
                        },
                        ...PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.map(f =>
                          f(this),
                        ),
                      ].map(({ icon, name, onClick }) => (
                        <MenuIconContainer
                          key={name}
                          onClick={() => {
                            onClick();
                            closePopover();
                          }}
                        >
                          <Icon
                            name={icon}
                            size={ICON_SIZE}
                            className={CS.mr2}
                          />
                          <h4>{name}</h4>
                        </MenuIconContainer>
                      ))}
                    </div>
                  )}
                />
              )}
              <HideSearchIcon
                name="close"
                size={HEADER_ICON_SIZE}
                isHidden={!showSearch}
                onClick={handleHideSearch}
              />
            </div>
          </div>
          <div className={CS.flexFull}>
            {displayedItems.length > 0
              ? displayedItems.map(item => (
                  <SnippetSidebarRow
                    key={`${item.model || "snippet"}-${item.id}`}
                    item={item}
                    type={item.model || "snippet"}
                    canWrite={snippetCollection.can_write}
                    setSnippetCollectionId={setSnippetCollectionId}
                    user={user}
                    insertSnippet={insertSnippet}
                    setModalSnippet={setModalSnippet}
                    permissionsModalCollectionId={permissionsModalCollectionId}
                    setPermissionsModalCollectionId={
                      setPermissionsModalCollectionId
                    }
                    modalSnippetCollection={modalSnippetCollection}
                    setModalSnippetCollection={setModalSnippetCollection}
                  />
                ))
              : null}
          </div>
        </div>
      )}
      {PLUGIN_SNIPPET_SIDEBAR_MODALS.map(f => f(this))}
    </SidebarContent>
  );
};

export const SnippetSidebar = _.compose(
  Snippets.loadList(),
  SnippetCollections.loadList(),
  SnippetCollections.load({
    id: (state, props) =>
      props.snippetCollectionId === null ? "root" : props.snippetCollectionId,
    wrapped: true,
  }),
  Search.loadList({
    query: (state, props) => ({
      collection:
        props.snippetCollectionId === null ? "root" : props.snippetCollectionId,
      namespace: "snippets",
    }),
  }),
)(SnippetSidebarInner);
