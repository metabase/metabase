import React, { Component, PropTypes } from "react";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";
import { Sortable } from "react-sortable";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import FieldList from "metabase/query_builder/components/FieldList.jsx";
import Query from "metabase/lib/query";

import { getFriendlyName } from "metabase/visualizations/lib/utils";
import cx from "classnames";

@Sortable
class OrderedFieldListItem extends Component {
  render() {
    return (
      <div {...this.props} className="list-item">{this.props.children}</div>
    )
  }
}

function getField(col) {
    return (col.fk_field_id != null) ? ["fk->", col.fk_field_id, col.id] : col.id;
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
        const { columnsByName, tableMetadata, addField, removeField } = this.props;
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
                            <span className="ml1 h4">{getFriendlyName(columnsByName[item.name])}</span>
                            { columnsByName[item.name].source === "fields" &&
                                <a className="ml1 cursor-pointer text-grey-2 text-grey-4-hover" onClick={() => removeField(getField(columnsByName[item.name]))} >
                                    <Icon name="close" size={6} />
                                </a>
                            }
                            <Icon className="flex-align-right text-grey-2 mr1 cursor-pointer" name="grabber" width={14} height={14}/>
                        </div>
                    </OrderedFieldListItem>
                )}
                { tableMetadata &&
                    <PopoverWithTrigger
                        ref="addField"
                        triggerElement={"Add a field..."}
                        triggerClasses="mt1"
                    >
                        <FieldList
                            tableMetadata={tableMetadata}
                            field={null}
                            fieldOptions={Query.getFieldOptions(tableMetadata.fields, true)}
                            onFieldChange={(field) => {
                                addField(field);
                                this.refs.addField.close();
                            }}
                            enableTimeGrouping={false}
                        />
                    </PopoverWithTrigger>
                }
            </div>
        )
  }
}
