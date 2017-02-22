import React, { Component, PropTypes } from "react";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";
import { sortable } from "react-sortable";

import cx from "classnames";

@sortable
class OrderedFieldListItem extends Component {
  render() {
    return (
      <div {...this.props} className="list-item">{this.props.children}</div>
    )
  }
}

export default class ChartSettingOrderedFields extends Component {
    constructor(props) {
        super(props);
        this.state = {
            draggingIndex: null,
            data: { items: [...this.props.value] }
        };
    }

    componentWillReceiveProps(nextProps) {
        this.setState({ data: { items: [...nextProps.value] } })
    }

    updateState = (obj) => {
        this.setState(obj);
        if (obj.draggingIndex == null) {
            this.props.onChange([...this.state.data.items]);
        }
    }

    setEnabled = (index, checked) => {
        const items = [...this.state.data.items];
        items[index] = { ...items[index], enabled: checked };
        this.setState({ data: { items } });
        this.props.onChange([...items]);
    }

    render() {
        const { columnNames } = this.props;
        return (
            <div className="list">
                {this.state.data.items.map((item, i) =>
                    <OrderedFieldListItem
                        key={i}
                        updateState={this.updateState}
                        items={this.state.data.items}
                        draggingIndex={this.state.draggingIndex}
                        sortId={i}
                        outline="list"
                    >
                        <div className={cx("flex align-center p1", { "text-grey-2": !item.enabled })} >
                            <CheckBox checked={item.enabled} className={cx("text-brand", { "text-grey-2": !item.enabled })} onChange={(e) => this.setEnabled(i, e.target.checked)} invertChecked />
                            <span className="ml1 h4">{columnNames[item.name]}</span>
                            <Icon className="flex-align-right text-grey-2 mr1 cursor-pointer" name="grabber" width={14} height={14}/>
                        </div>
                    </OrderedFieldListItem>
                )}
            </div>
        )
  }
}
