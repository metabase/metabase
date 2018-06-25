import React from "react";
import PropTypes from "prop-types";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/components/SelectButton";

export default (PickerComponent, NameComponent, type) =>
  class ItemSelect extends React.Component {
    static propTypes = {
      // collection ID, null (for root collection), or undefined
      value: PropTypes.number,
      onChange: PropTypes.func.isRequired,
      field: PropTypes.object.isRequired,
      // optional collectionId to filter out so you can't move a collection into itself
      collectionId: PropTypes.number,
    };

    static defaultProps = {
      placeholder: `Select a ${type}`,
    };

    render() {
      const {
        value,
        onChange,
        className,
        style,
        placeholder,
        ...props
      } = this.props;
      return (
        <PopoverWithTrigger
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
        >
          {({ onClose }) => (
            <PickerComponent
              {...props}
              style={{ minWidth: 300 }}
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
