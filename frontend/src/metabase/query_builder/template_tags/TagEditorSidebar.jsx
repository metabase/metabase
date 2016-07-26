/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import Icon from "metabase/components/Icon.jsx";
import TagEditorParam from "./TagEditorParam.jsx";
import TagEditorHelp from "./TagEditorHelp.jsx";

import cx from "classnames";
import { getTemplateTags } from "metabase/meta/Card";

export default class TagEditorSidebar extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            section: null
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        onClose: PropTypes.func.isRequired,
        updateTemplateTag: PropTypes.func.isRequired,
        databaseFields: PropTypes.array,
        setQuery: PropTypes.func.isRequired,
        sampleDatasetId: PropTypes.number,
    };

    render() {

        const { card } = this.props;
        const tags = getTemplateTags(card);

        let section;
        if (tags.length === 0) {
            section = "help";
        } else if (this.state.section == null) {
            section = "settings";
        } else {
            section = this.state.section;
        }

        return (
            <div className="DataReference-container p3 full-height scroll-y">
                <div className="DataReference-header flex align-center mb2">
                    <h2 className="text-default">
                        Variables
                    </h2>
                    <a className="flex-align-right text-default text-brand-hover no-decoration" onClick={() => this.props.onClose()}>
                        <Icon name="close" width="18px" height="18px" />
                    </a>
                </div>
                <div className="DataReference-content">
                    <div className="Button-group Button-group--brand text-uppercase mb2">
                        <a className={cx("Button Button--small", { "Button--active": section === "settings" , "disabled": tags.length === 0 })} onClick={() => this.setState({ section: "settings" })}>Settings</a>
                        <a className={cx("Button Button--small", { "Button--active": section === "help" })} onClick={() => this.setState({ section: "help" })}>Help</a>
                    </div>
                    { section === "settings" ?
                        <SettingsPane tags={tags} onUpdate={this.props.updateTemplateTag} databaseFields={this.props.databaseFields}/>
                    :
                        <TagEditorHelp sampleDatasetId={this.props.sampleDatasetId} setQuery={this.props.setQuery}/>
                    }
                </div>
            </div>
        );
    }
}

const SettingsPane = ({ tags, onUpdate, databaseFields }) =>
    <div>
        { tags.map(tag =>
            <div key={tags.name}>
                <TagEditorParam tag={tag} onUpdate={onUpdate} databaseFields={databaseFields} />
            </div>
        ) }
    </div>

SettingsPane.propTypes = {
    tags: PropTypes.object.isRequired,
    onUpdate: PropTypes.func.isRequired,
    databaseFields: PropTypes.array
};
