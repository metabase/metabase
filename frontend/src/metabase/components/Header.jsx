import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import { getScrollY } from "metabase/lib/dom";

import CollectionBadge from "metabase/questions/components/CollectionBadge";
import EditBar from "metabase/components/EditBar";
import EditWarning from "metabase/components/EditWarning";
import HeaderModal from "metabase/components/HeaderModal";
import TitleAndDescription from "metabase/components/TitleAndDescription";
import {
  HeaderRoot,
  HeaderBadges,
  HeaderBadgesDivider,
  HeaderContent,
  HeaderButtonsContainer,
  HeaderButtonSection,
  StyledLastEditInfoLabel,
  HeaderCaption,
} from "./Header.styled";

const propTypes = {
  analyticsContext: PropTypes.string,
  editingTitle: PropTypes.string,
  editingSubtitle: PropTypes.string,
  editingButtons: PropTypes.arrayOf(PropTypes.node),
  editWarning: PropTypes.string,
  headerButtons: PropTypes.arrayOf(PropTypes.node),
  headerClassName: PropTypes.string,
  headerModalMessage: PropTypes.string,
  isEditing: PropTypes.bool,
  isEditingInfo: PropTypes.bool,
  item: PropTypes.object.isRequired,
  objectType: PropTypes.string.isRequired,
  isBadgeVisible: PropTypes.bool,
  isLastEditInfoVisible: PropTypes.bool,
  children: PropTypes.node,
  setItemAttributeFn: PropTypes.func,
  onHeaderModalDone: PropTypes.func,
  onHeaderModalCancel: PropTypes.func,
  onLastEditInfoClick: PropTypes.func,
};

const defaultProps = {
  headerButtons: [],
  editingTitle: "",
  editingSubtitle: "",
  editingButtons: [],
  headerClassName: "py1 lg-py2 xl-py3 wrapper",
};

class Header extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      headerHeight: 0,
    };
    this.header = React.createRef();
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
    if (!this.header.current) {
      return;
    }

    const rect = this.header.current.getBoundingClientRect();
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
    const {
      item,
      isBadgeVisible,
      isLastEditInfoVisible,
      onLastEditInfoClick,
    } = this.props;

    let titleAndDescription;
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

    const headerButtons = this.props.headerButtons.map(
      (section, sectionIndex) => {
        return (
          section &&
          section.length > 0 && (
            <HeaderButtonSection
              key={sectionIndex}
              className="Header-buttonSection"
            >
              {section}
            </HeaderButtonSection>
          )
        );
      },
    );

    return (
      <div>
        {this.renderEditHeader()}
        {this.renderEditWarning()}
        {this.renderHeaderModal()}
        <HeaderRoot
          className={cx("QueryBuilder-section", this.props.headerClassName)}
          ref={this.header}
        >
          <HeaderContent>
            <HeaderCaption>{titleAndDescription}</HeaderCaption>
            <HeaderBadges>
              {isBadgeVisible && (
                <>
                  <CollectionBadge
                    collectionId={item.collection_id}
                    analyticsContext={this.props.analyticsContext}
                  />
                </>
              )}
              {isBadgeVisible && isLastEditInfoVisible && (
                <HeaderBadgesDivider>•</HeaderBadgesDivider>
              )}
              {isLastEditInfoVisible && (
                <StyledLastEditInfoLabel
                  item={item}
                  onClick={onLastEditInfoClick}
                />
              )}
            </HeaderBadges>
          </HeaderContent>

          <HeaderButtonsContainer>{headerButtons}</HeaderButtonsContainer>
        </HeaderRoot>
        {this.props.children}
      </div>
    );
  }
}

Header.propTypes = propTypes;
Header.defaultProps = defaultProps;

export default Header;
