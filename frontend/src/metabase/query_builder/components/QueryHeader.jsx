import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "c-3po";
import QueryModeButton from "./QueryModeButton";

import ActionButton from "metabase/components/ActionButton";
import ButtonBar from "metabase/components/ButtonBar";
import HeaderBar from "metabase/components/HeaderBar";
import Icon from "metabase/components/Icon";

import Tooltip from "metabase/components/Tooltip";
import CollectionBadge from "metabase/questions/components/CollectionBadge";

import { clearRequestState } from "metabase/redux/requests";

import cx from "classnames";
import _ from "underscore";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import EntityMenu from "metabase/components/EntityMenu";
import AlertListPopoverContent from "metabase/query_builder/components/AlertListPopoverContent";
import { getUser } from "metabase/home/selectors";
import { fetchAlertsForQuestion } from "metabase/alert/alert";

import Collections from "metabase/entities/collections";

const mapStateToProps = (state, props) => ({
  user: getUser(state),
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  fetchAlertsForQuestion,
  clearRequestState,
};
const ICON_SIZE = 16;

@connect(mapStateToProps, mapDispatchToProps)
export default class QueryHeader extends Component {
  static propTypes = {
    question: PropTypes.object.isRequired,
    card: PropTypes.object.isRequired,
    originalCard: PropTypes.object,
    isEditing: PropTypes.bool.isRequired,
    tableMetadata: PropTypes.object, // can't be required, sometimes null
    setCardAttribute: PropTypes.func.isRequired,
    setQueryMode: PropTypes.func.isRequired,
    isShowingDataReference: PropTypes.bool.isRequired,
    toggleDataReference: PropTypes.func.isRequired,
    isNew: PropTypes.bool.isRequired,
    isDirty: PropTypes.bool.isRequired,
  };

  onBeginEditing = () => {
    this.props.beginEditing();
  };

  onCancel = async () => {
    if (this.props.fromUrl) {
      this.props.onChangeLocation(this.props.fromUrl);
    } else {
      this.props.cancelEditing();
    }
  };

  onFollowBreadcrumb = () => {
    this.props.reloadCard();
  };

  onToggleDataReference = () => {
    this.props.toggleDataReference();
  };

  openModal = modal => {
    this.props.onOpenModal(modal);
  };

  closeModal = modal => {
    this.props.onCloseModal();
  };

  getHeaderButtons() {
    const {
      question,
      questionAlerts,
      visualizationSettings,
      card,
      isNew,
      isDirty,
      isEditing,
      tableMetadata,
      databases,
    } = this.props;
    const database = _.findWhere(databases, {
      id: card && card.dataset_query && card.dataset_query.database,
    });

    let buttonSections = [];

    // A card that is either completely new or it has been derived from a saved question
    if (isNew && isDirty) {
      buttonSections.push([
        <span
          key="save"
          className="h4 text-medium text-brand-hover text-uppercase"
          onClick={() => this.openModal("save")}
        >
          {t`Save`}
        </span>,
      ]);
    }

    // persistence buttons on saved cards
    if (!isNew && card.can_write) {
      if (!isEditing) {
        if (this.props.recentlySaved) {
          // existing card + not editing + recently saved = save confirmation
          buttonSections.push([
            <button
              key="recentlySaved"
              className="cursor-pointer bg-white text-success text-bold text-uppercase"
            >
              <span>
                <Icon name="check" size={12} />
                <span className="ml1">{t`Saved`}</span>
              </span>
            </button>,
          ]);
        } else {
          // edit button
          buttonSections.push([
            <Tooltip key="edit" tooltip={t`Edit question`}>
              <a
                className="cursor-pointer text-brand-hover"
                onClick={this.props.beginEditing}
              >
                <Icon name="pencil" size={16} />
              </a>
            </Tooltip>,
          ]);
        }
      } else {
        // save button
        buttonSections.push([
          <ActionButton
            key="save"
            actionFn={() => this.onSave(this.props.card, false)}
            className="cursor-pointer text-brand-hover bg-white text-medium text-uppercase"
            normalText={t`SAVE CHANGES`}
            activeText={t`Saving…`}
            failedText={t`Save failed`}
            successText={t`Saved`}
          />,
        ]);

        // cancel button
        buttonSections.push([
          <a
            key="cancel"
            className="cursor-pointer text-brand-hover text-medium text-uppercase"
            onClick={this.onCancel}
          >
            {t`CANCEL`}
          </a>,
        ]);

        // delete button
        buttonSections.push([
          <Tooltip key="archive" tooltip={t`Archive`}>
            <Icon
              name="archive"
              size={16}
              className="text-brand-hover"
              onClick={() => this.openModal("archive")}
            />
          </Tooltip>,
        ]);

        buttonSections.push([
          <Tooltip key="move" tooltip={t`Move question`}>
            <Icon name="move" onClick={() => this.openModal("move")} />
          </Tooltip>,
        ]);
      }
    }

    // parameters
    if (
      question.query() instanceof NativeQuery &&
      database &&
      _.contains(database.features, "native-parameters")
    ) {
      const parametersButtonClasses = cx("transition-color", {
        "text-brand": this.props.uiControls.isShowingTemplateTagsEditor,
        "text-brand-hover": !this.props.uiControls.isShowingTemplateTagsEditor,
      });
      buttonSections.push([
        <Tooltip key="parameterEdititor" tooltip={t`Variables`}>
          <a className={parametersButtonClasses}>
            <Icon
              name="variable"
              size={16}
              onClick={this.props.toggleTemplateTagsEditor}
            />
          </a>
        </Tooltip>,
      ]);
    }

    // add to dashboard
    if (!isNew && !isEditing) {
      // simply adding an existing saved card to a dashboard, so show the modal to do so
      buttonSections.push([
        <Tooltip key="addtodash" tooltip={t`Add to dashboard`}>
          <span
            data-metabase-event={"QueryBuilder;AddToDash Modal;normal"}
            className="cursor-pointer text-brand-hover"
            onClick={() => this.openModal("add-to-dashboard")}
          >
            <Icon name="addtodash" size={ICON_SIZE} />
          </span>
        </Tooltip>,
      ]);
    } else if (isNew && isDirty) {
      // this is a new card, so we need the user to save first then they can add to dash
      buttonSections.push([
        <Tooltip key="addtodashsave" tooltip={t`Add to dashboard`}>
          <span
            data-metabase-event={"QueryBuilder;AddToDash Modal;pre-save"}
            className="h4 text-brand-hover text-uppercase text-brand-hover"
            onClick={() => this.openModal("add-to-dashboard-save")}
          >
            <Icon name="addtodash" size={ICON_SIZE} />
          </span>
        </Tooltip>,
      ]);
    }

    // history icon on saved cards
    if (!isNew) {
      buttonSections.push([
        <Tooltip key="history" tooltip={t`Revision history`}>
          <span
            className="text-brand-hover"
            onClick={() => this.openModal("history")}
          >
            <Icon name="history" size={18} />
          </span>
        </Tooltip>,
      ]);
    }

    // query mode toggle
    buttonSections.push([
      <QueryModeButton
        key="queryModeToggle"
        mode={this.props.card.dataset_query.type}
        allowNativeToQuery={isNew && !isDirty}
        allowQueryToNative={
          tableMetadata
            ? // if a table is selected, only enable if user has native write permissions for THAT database
              tableMetadata.db &&
              tableMetadata.db.native_permissions === "write"
            : // if no table is selected, only enable if user has native write permissions for ANY database
              _.any(databases, db => db.native_permissions === "write")
        }
        nativeForm={
          this.props.result &&
          this.props.result.data &&
          this.props.result.data.native_form
        }
        onSetMode={this.props.setQueryMode}
        tableMetadata={tableMetadata}
      />,
    ]);

    // data reference button
    let dataReferenceButtonClasses = cx("transition-color text-brand-hover", {
      "text-brand": this.props.isShowingDataReference,
    });
    buttonSections.push([
      <Tooltip key="dataReference" tooltip={t`Learn about your data`}>
        <a className={dataReferenceButtonClasses}>
          <Icon
            name="reference"
            size={ICON_SIZE}
            onClick={this.onToggleDataReference}
          />
        </a>
      </Tooltip>,
    ]);

    if (
      !isEditing &&
      card &&
      question.alertType(visualizationSettings) !== null
    ) {
      const createAlertItem = {
        title: t`Get alerts about this`,
        icon: "alert",
        action: () => this.openModal("create-alert"),
      };
      const createAlertAfterSavingQuestionItem = {
        title: t`Get alerts about this`,
        icon: "alert",
        action: () => this.openModal("save-question-before-alert"),
      };

      const updateAlertItem = {
        title: t`Alerts are on`,
        icon: "alert",
        content: (toggleMenu, setMenuFreeze) => (
          <AlertListPopoverContent
            closeMenu={toggleMenu}
            setMenuFreeze={setMenuFreeze}
          />
        ),
      };

      buttonSections.push([
        <div className="mr1" style={{ marginLeft: "-15px" }}>
          <EntityMenu
            triggerIcon="burger"
            items={[
              !isNew && Object.values(questionAlerts).length > 0
                ? updateAlertItem
                : isNew ? createAlertAfterSavingQuestionItem : createAlertItem,
            ]}
          />
        </div>,
      ]);
    }

    return (
      <ButtonBar
        buttons={buttonSections}
        className="Header-buttonSection borderless"
      />
    );
  }

  showAlertsAfterQuestionSaved = () => {
    const { questionAlerts, user } = this.props;

    const hasAlertsCreatedByCurrentUser = Object.values(questionAlerts).some(
      alert => alert.creator.id === user.id,
    );

    if (hasAlertsCreatedByCurrentUser) {
      // TODO Atte Keinänen 11/10/17: The question was replaced and there is already an alert created by current user.
      // Should we show pop up the alerts list in this case or do nothing (as we do currently)?
      this.closeModal();
    } else {
      this.openModal("create-alert");
    }
  };

  render() {
    return (
      <div className="relative px2 sm-px0">
        <HeaderBar
          isEditing={this.props.isEditing}
          name={this.props.isNew ? t`New question` : this.props.card.name}
          description={this.props.card ? this.props.card.description : null}
          breadcrumb={
            !this.props.card.id && this.props.originalCard ? (
              <span className="pl2">
                {t`started from`}{" "}
                <a className="link" onClick={this.onFollowBreadcrumb}>
                  {this.props.originalCard.name}
                </a>
              </span>
            ) : null
          }
          buttons={this.getHeaderButtons()}
          setItemAttributeFn={this.props.setCardAttribute}
          badge={
            this.props.card.id && (
              <CollectionBadge
                collectionId={this.props.card.collection_id}
                analyticsContext="QueryBuilder"
              />
            )
          }
        />
      </div>
    );
  }
}
