import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";

import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/components/SelectButton";

const MIN_POPOVER_WIDTH = 300;

export default (PickerComponent, NameComponent, type) =>
  class ItemSelect extends React.Component {
    state = {
      width: MIN_POPOVER_WIDTH,
    };

    static propTypes = {
      // collection ID, null (for root collection), or undefined
      value: PropTypes.number,
      onChange: PropTypes.func.isRequired,
      field: PropTypes.object.isRequired,
      // optional collectionId to filter out so you can't move a collection into itself
      collectionId: PropTypes.number,
      // make the popover content inherit the select widget's width
      inheritWidth: PropTypes.bool,
    };

    static defaultProps = {
      placeholder: t`Select a ${type}`,
      inheritWidth: true,
    };

    componentDidMount() {
      this.componentDidUpdate();
    }

    componentDidUpdate() {
      // save the width so we can make the poopver content match
      const { width } = ReactDOM.findDOMNode(this).getBoundingClientRect();
      if (this.state.width !== width) {
        this.setState({ width });
      }
    }

    render() {
      const {
        value,
        onChange,
        className,
        style,
        placeholder,
        inheritWidth,
        ...props
      } = this.props;
      return (
        <PopoverWithTrigger
          pinInitialAttachment // keep the popover from jumping if content height changes
          triggerClasses={className}
          triggerElement={
            <SelectButton style={style}>
              {value !== undefined && value !== "" ? (
                <NameComponent collectionId={value} />
              ) : (
                placeholder
              )}
            </SelectButton>
          }
          sizeToFit
          autoWidth
        >
          {({ onClose }) => (
            <PickerComponent
              {...props}
              style={
                inheritWidth
                  ? { width: Math.max(this.state.width, MIN_POPOVER_WIDTH) }
                  : { minWidth: MIN_POPOVER_WIDTH }
              }
              className="p2 overflow-auto"
              value={value}
              onChange={itemId => {
                onChange(itemId);
                onClose();
              }}
            />
          )}
        </PopoverWithTrigger>
      );
    }
  };
