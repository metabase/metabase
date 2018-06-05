import React, { Component } from "react";
import ReactDOM from "react-dom";
import { Box, Flex } from "rebass"

import Input from "metabase/components/Input.jsx";
import HeaderModal from "metabase/components/HeaderModal.jsx";
import TitleAndDescription from "metabase/components/TitleAndDescription.jsx";
import EditBar from "metabase/components/EditBar.jsx";
import { t } from "c-3po";
import { getScrollY } from "metabase/lib/dom";

export default class Header extends Component {
  static defaultProps = {
    headerButtons: [],
    editingTitle: "",
    editingSubtitle: "",
    editingButtons: [],
    headerClassName: "",
  };

  state = {
    headerHeight: 0,
  }

  componentDidMount() {
    this.updateHeaderHeight();
  }

  componentWillUpdate() {
    const modalIsOpen = !!this.props.headerModalMessage;
    if (modalIsOpen) {
      this.updateHeaderHeight();
    }
  }

  updateHeaderHeight() {
    if (!this.refs.header) return;

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
    let titleAndDescription;
    if (this.props.isEditingInfo) {
      titleAndDescription = (
        <div className="Header-title flex flex-column flex-full bordered rounded my1">
          <Input
            className="AdminInput text-bold border-bottom rounded-top h3"
            type="text"
            value={this.props.item.name || ""}
            onChange={this.setItemAttribute.bind(this, "name")}
          />
          <Input
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

    let headerButtons = this.props.headerButtons.map(
      (section, sectionIndex) => {
        return (
          section &&
          section.length > 0 && (
            <Box
              key={sectionIndex}
              mx={1}
            >
              {section.map((button, buttonIndex) => (
                <span key={buttonIndex} className="Header-button">
                  {button}
                </span>
              ))}
            </Box>
          )
        );
      },
    );

    return (
      <Box>
        {this.renderEditHeader()}
        {this.renderHeaderModal()}
        <Flex
          align='center'
          ref="header"
          px={4}
        >
          <Box className="Entity py3">
            {titleAndDescription}
            {attribution}
          </Box>

          <Flex align='center' ml='auto'>
            {headerButtons}
          </Flex>
        </Flex>
        {this.props.children}
      </Box>
    );
  }
}
