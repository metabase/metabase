import React, { Component } from "react";
import ReactDOM from "react-dom";

import CollectionBadge from "metabase/questions/components/CollectionBadge";
import InputBlurChange from "metabase/components/InputBlurChange";
import HeaderModal from "metabase/components/HeaderModal";
import TitleAndDescription from "metabase/components/TitleAndDescription";
import EditBar from "metabase/components/EditBar";
import EditWarning from "metabase/components/EditWarning";
import { t } from "ttag";
import { getScrollY } from "metabase/lib/dom";

export default class Header extends Component {
  static defaultProps = {
    headerButtons: [],
    editingTitle: "",
    editingSubtitle: "",
    editingButtons: [],
    headerClassName: "py1 lg-py2 xl-py3 wrapper",
  };

  constructor(props, context) {
    super(props, context);

    this.state = {
      headerHeight: 0,
    };
  }

  componentDidMount() {
    this.updateHeaderHeight();
  }

  componentDidUpdate() {
    const modalIsOpen = !!this.props.headerModalMessage;
    if (modalIsOpen) {
      this.updateHeaderHeight();
    }
  }

  updateHeaderHeight() {
    if (!this.refs.header) {
      return;
    }

    const rect = ReactDOM.findDOMNode(this.refs.header).getBoundingClientRect();
    const headerHeight = rect.top + getScrollY();
    if (this.state.headerHeight !== headerHeight) {
      this.setState({ headerHeight });
    }
  }

  setItemAttribute(attribute, event) {
    this.props.setItemAttributeFn(attribute, event.target.value);
  }

  renderEditHeader() {
    if (this.props.isEditing) {
      return (
        <EditBar
          title={this.props.editingTitle}
          subtitle={this.props.editingSubtitle}
          buttons={this.props.editingButtons}
        />
      );
    }
  }

  renderEditWarning() {
    if (this.props.editWarning) {
      return <EditWarning title={this.props.editWarning} />;
    }
  }

  renderHeaderModal() {
    return (
      <HeaderModal
        isOpen={!!this.props.headerModalMessage}
        height={this.state.headerHeight}
        title={this.props.headerModalMessage}
        onDone={this.props.onHeaderModalDone}
        onCancel={this.props.onHeaderModalCancel}
      />
    );
  }

  render() {
    const { item } = this.props;
    let titleAndDescription;
    if (this.props.isEditingInfo) {
      titleAndDescription = (
        <div className="Header-title flex flex-column flex-full bordered rounded my1">
          <InputBlurChange
            className="AdminInput text-bold border-bottom rounded-top h3"
            type="text"
            value={this.props.item.name || ""}
            onChange={this.setItemAttribute.bind(this, "name")}
          />
          <InputBlurChange
            className="AdminInput rounded-bottom h4"
            type="text"
            value={this.props.item.description || ""}
            onChange={this.setItemAttribute.bind(this, "description")}
            placeholder={t`No description yet`}
          />
        </div>
      );
    } else {
      if (this.props.item && this.props.item.id != null) {
        titleAndDescription = (
          <TitleAndDescription
            title={this.props.item.name}
            description={this.props.item.description}
          />
        );
      } else {
        titleAndDescription = (
          <TitleAndDescription
            title={t`New ${this.props.objectType}`}
            description={this.props.item.description}
          />
        );
      }
    }

    let attribution;
    if (this.props.item && this.props.item.creator) {
      attribution = (
        <div className="Header-attribution">
          {t`Asked by ${this.props.item.creator.common_name}`}
        </div>
      );
    }

    const headerButtons = this.props.headerButtons.map(
      (section, sectionIndex) => {
        return (
          section &&
          section.length > 0 && (
            <span
              key={sectionIndex}
              className="Header-buttonSection flex align-center"
            >
              {section.map((button, buttonIndex) => (
                <span key={buttonIndex} className="Header-button">
                  {button}
                </span>
              ))}
            </span>
          )
        );
      },
    );

    return (
      <div>
        {this.renderEditHeader()}
        {this.renderEditWarning()}
        {this.renderHeaderModal()}
        <div
          className={
            "QueryBuilder-section flex align-center " +
            this.props.headerClassName
          }
          ref="header"
        >
          <div className="Entity py3">
            <span className="inline-block mb1">{titleAndDescription}</span>
            {attribution}
            {this.props.showBadge && (
              <CollectionBadge
                collectionId={item.collection_id}
                analyticsContext={this.props.analyticsContext}
              />
            )}
          </div>

          <div className="flex align-center flex-align-right">
            {headerButtons}
          </div>
        </div>
        {this.props.children}
      </div>
    );
  }
}
