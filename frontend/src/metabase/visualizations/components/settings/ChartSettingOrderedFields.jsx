import React, { Component } from "react";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";
import {
    SortableContainer,
    SortableElement,
    SortableHandle,
    arrayMove
} from "react-sortable-hoc";

import cx from "classnames";

const FieldListHandle = SortableHandle(() =>
<Icon
    className="flex-align-right text-grey-2 mr1 cursor-pointer"
    name="grabber"
    width={14}
    height={14}
/>
)

const FieldListItem = SortableElement(({
    item,
    columnNames,
    setEnabled
}) => (
    <li
        className={cx("flex align-center p1", {
            "text-grey-2": !item.enabled
        })}
    >
        <CheckBox
            checked={item.enabled}
            onChange={e => setEnabled(e.target.checked)}
        />
        <span className="ml1 h4">
            {columnNames[item.name]}
        </span>
        <FieldListHandle />
    </li>
));

const FieldListContainer = SortableContainer(({ items, columnNames, setEnabled }) => {
    return (
        <ul>
            {items.map((item, index) => (
                <FieldListItem
                    key={`item-${index}`}
                    item={item}
                    columnNames={columnNames}
                    setEnabled={(enabled) => setEnabled(index, enabled)}
                />
            ))}
        </ul>
    );
});

export default class ChartSettingOrderedFields extends Component {
    constructor(props) {
        super(props);
        this.state = {
            items: [...this.props.value]
        };
    }

    componentWillReceiveProps(nextProps) {
        this.setState({
            items: [...nextProps.value]
        });
    }
    onSortEnd = ({ oldIndex, newIndex }) => {
        this.setState({
            items: arrayMove(this.state.items, oldIndex, newIndex)
        }, () =>
            this.props.onChange(this.state.items)
        );
    };

    setEnabled = (index, checked) => {
        const items = [...this.state.items];
        items[index] = { ...items[index], enabled: checked };
        this.setState({ items });
        this.props.onChange([...items]);
    }

    isAnySelected = () => {
        for ( const item of [...this.state.items]) {
            if ( item.enabled ) {
              return true
            }
        }
        return false;
    }

    toggleAll = (anySelected) => {
        const items = [...this.state.items].map((item) => ({ ...item, enabled: !anySelected }));
        this.setState({ items });
        this.props.onChange([...items]);
    }

    render() {
        const { columnNames } = this.props;
        const anySelected = this.isAnySelected();
        return (
            <div className="list">
                <div className="toggle-all">
                    <div className={cx("flex align-center p1", { "text-grey-2": !anySelected })} >
                        <CheckBox checked={anySelected} className={cx("text-brand", { "text-grey-2": !anySelected })} onChange={(e) => this.toggleAll(anySelected)} invertChecked />
                        <span className="ml1 h4">{ anySelected ? 'Unselect all' : 'Select all'}</span>
                    </div>
                </div>
                <FieldListContainer
                    items={this.state.items}
                    onSortEnd={this.onSortEnd}
                    columnNames={columnNames}
                    setEnabled={this.setEnabled}
                    useDragHandle
                />
            </div>
        );
    }
}
