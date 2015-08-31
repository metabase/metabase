"use strict";

import Input from "metabase/components/Input.react";

export default class Header extends React.Component {

    setItemAttribute(attribute, event) {
        this.props.setItemAttributeFn(attribute, event.target.value);
    }

    renderEditHeader() {
        if (this.props.isEditing) {
            return (
                <div className="EditHeader wrapper py1 flex align-center">
                    <span className="EditHeader-title">{this.props.editingTitle}</span>
                    <span className="EditHeader-subtitle mx1">{this.props.editingSubtitle}</span>
                    <span className="flex-align-right">
                        {this.props.editingButtons.map((button, buttonIndex) => <span key={buttonIndex}>{button}</span>)}
                    </span>
                </div>
            );
        }
    }

    render() {
        var titleAndDescription;
        if (this.props.isEditingInfo) {
            titleAndDescription = (
                <div className="Header-title flex flex-column flex-full bordered rounded my1">
                    <Input className="AdminInput text-bold border-bottom rounded-top h3" type="text" value={this.props.item.name} onChange={this.setItemAttribute.bind(this, "name")}/>
                    <Input className="AdminInput rounded-bottom h4" type="text" value={this.props.item.description} onChange={this.setItemAttribute.bind(this, "description")} placeholder="No description yet" />
                </div>
            );
        } else {
            if (this.props.item && this.props.item.id != null) {
                titleAndDescription = (
                    <div className="Header-title my1 py2">
                        <h2>{this.props.item.name}</h2>
                        <h4 className="text-grey-3">{this.props.item.description || "No description yet"}</h4>
                    </div>
                );
            } else {
                titleAndDescription = (
                    <div className="flex align-center">
                        <h1 className="Entity-title my1">{"New " + this.props.objectType}</h1>
                    </div>
                );
            }
        }

        var attribution;
        if (this.props.item && this.props.item.creator && false) {
            attribution = (
                <div className="Entity-attribution">
                    Asked by {this.props.item.creator.common_name}
                </div>
            );
        }

        var headerButtons = this.props.headerButtons.map((section, sectionIndex) => {
            return (
                <span key={sectionIndex} className="Header-buttonSection">
                    {section.map((button, buttonIndex) => {
                        return <span key={buttonIndex}>{button}</span>;
                    })}
                </span>
            );
        });

        return (
            <div>
                {this.renderEditHeader()}
                <div className={"QueryBuilder-section flex align-center " + this.props.headerClassName}>
                    <div className="Entity">
                        {titleAndDescription}
                        {attribution}
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

Header.defaultProps = {
    headerButtons: [],
    editingTitle: "",
    editingSubtitle: "",
    editingButtons: [],
    headerClassName: "py1 lg-py2 xl-py3 wrapper"
};
