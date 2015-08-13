"use strict";

import Input from "metabase/components/Input.react";

export default class Header extends React.Component {

    renderEditHeader() {
        if (this.props.isEditing) {
            return (
                <div className="EditHeader p1 px3 flex align-center">
                    <span className="EditHeader-title">{this.props.editingTitle}</span>
                    <span className="EditHeader-subtitle mx1">{this.props.editingSubtitle}</span>
                    <span className="flex-align-right">
                        {this.props.editingButtons}
                    </span>
                </div>
            );
        }
    }

    render() {
        var titleAndDescription;
        if (this.props.isEditable) {
            titleAndDescription = (
                <div className="EditTitle flex flex-column flex-full bordered rounded mt1 mb2">
                    <Input className="AdminInput text-bold border-bottom rounded-top h3" type="text" value={this.props.item.name} onChange={this.props.setItemAttributeFn.bind(null, "name")}/>
                    <Input className="AdminInput rounded-bottom h4" type="text" value={this.props.item.description} onChange={this.props.setItemAttributeFn.bind(null, "description")} placeholder="No description yet" />
                </div>
            );
        } else {
            titleAndDescription = (
                <div className="flex align-center">
                    <h1 className="Entity-title">New question</h1>
                </div>
            );
        }

        var attribution;
        if(this.props.item.creator && false) {
            attribution = (
                <div className="Entity-attribution">
                    Asked by {this.props.item.creator.common_name}
                </div>
            );
        }

        var headerButtons = this.props.headerButtons.map((sectionButtons) => {
            return (
                <span className="QueryHeader-section">
                    {sectionButtons}
                </span>
            );
        });

        return (
            <div>
                {this.renderEditHeader()}
                <div className="py1 lg-py2 xl-py3 QueryBuilder-section wrapper flex align-center">
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
    editingButtons: []
};
