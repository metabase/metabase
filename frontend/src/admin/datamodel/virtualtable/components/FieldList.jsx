import React, { Component, PropTypes } from "react";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";


export default class FieldList extends Component {

    static propTypes = {
        fields: PropTypes.array.isRequired,
        isChecked: PropTypes.func,
        onToggleChecked: PropTypes.func,
        canAction: PropTypes.func,
        onAction: PropTypes.func,
        reorderable: PropTypes.bool
    };

    static defaultProps = {
        isChecked: () => false,
        canAction: () => false,
        reorderable: false
    };

    onToggleChecked(field, checked) {
        if (this.props.onToggleChecked) {
            this.props.onToggleChecked(field, checked);
        }
    }

    onActionField(field) {
        console.log("actionField", field);
        if (this.props.onAction) {
            this.props.onAction(field);
        }
    }

    // dragStart(e) {
    //     this.dragged = e.currentTarget;
    //     e.dataTransfer.effectAllowed = 'move';

    //     // Firefox requires calling dataTransfer.setData
    //     // for the drag to properly work
    //     e.dataTransfer.setData("text/html", e.currentTarget);
    // }

    // dragEnd(e) {
    //     this.dragged.style.display = "block";
    //     this.dragged.parentNode.removeChild(placeholder);

    //     // Update state
    //     var data = this.state.data;
    //     var from = Number(this.dragged.dataset.id);
    //     var to = Number(this.over.dataset.id);
    //     if(from < to) to--;
    //     data.splice(to, 0, data.splice(from, 1)[0]);
    //     this.setState({data: data});

    //     // for positioning at the end
    //     if(this.nodePlacement == "after") to++;
    // }

    // dragOver(e) {
    //     e.preventDefault();
    //     this.dragged.style.display = "none";
    //     if(e.target.className == "placeholder") return;
    //     this.over = e.target;
    //     e.target.parentNode.insertBefore(placeholder, e.target);

    //     // for positioning at the end
    //     var relY = e.clientY - this.over.offsetTop;
    //     var height = this.over.offsetHeight / 2;
    //     var parent = e.target.parentNode;

    //     if(relY > height) {
    //       this.nodePlacement = "after";
    //       parent.insertBefore(placeholder, e.target.nextElementSibling);
    //     }
    //     else if(relY < height) {
    //       this.nodePlacement = "before"
    //       parent.insertBefore(placeholder, e.target);
    //     }
    // }

    render() {
        const { fields, canAction, isChecked } = this.props;

        if (!fields) return;

        if (this.props.reorderable) {
            return (
                <ul className="scroll-y scroll-show"
                    onDragOver={this.dragOver}>
                    { fields.map((field, idx) =>
                        <li data-id={idx}
                            key={field.id || "f"+idx}
                            className="pb1 flex align-center justify-between"
                            draggable="true"
                            onDragStart={this.dragStart}
                            onDragEnd={this.dragEnd}>
                            { isChecked(field) ?
                                <div className="text-brand flex flex-row">
                                    <CheckBox borderColor="#509EE3" borderSize="1px" checked={true} onChange={(e) => this.onToggleChecked(field, e.target.checked)} />
                                    <span className="pl1 text-default">{field.display_name}</span>
                                </div>
                            :
                                <div className="text-grey-2 flex flex-row">
                                    <CheckBox borderSize="1px" checked={false} onChange={(e) => this.onToggleChecked(field, e.target.checked)} />
                                    <span className="pl1">{field.display_name}</span>
                                </div>
                            }
                            { canAction && canAction(field) ? <div onClick={() => this.onActionField(field)}><Icon name="pencil" width="12" height="12" /></div> : null }
                        </li>
                    )}
                </ul>
            );

        } else {
            return (
                <ul className="scroll-y scroll-show">
                    { fields.map((field, idx) =>
                        <li key={field.id || "f"+idx} className="pb1 flex align-center justify-between">
                            { isChecked(field) ?
                                <div className="text-brand flex flex-row">
                                    <CheckBox borderColor="#509EE3" borderSize="1px" checked={true} onChange={(e) => this.onToggleChecked(field, e.target.checked)} />
                                    <span className="pl1 text-default">{field.display_name}</span>
                                </div>
                            :
                                <div className="text-grey-2 flex flex-row">
                                    <CheckBox borderSize="1px" checked={false} onChange={(e) => this.onToggleChecked(field, e.target.checked)} />
                                    <span className="pl1">{field.display_name}</span>
                                </div>
                            }
                            { canAction && canAction(field) ? <div onClick={() => this.onActionField(field)}><Icon name="pencil" width="12" height="12" /></div> : null }
                        </li>
                    )}
                </ul>
            );
        }
    }
}
