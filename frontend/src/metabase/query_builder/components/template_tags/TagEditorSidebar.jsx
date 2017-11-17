/* @flow weak */

import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon.jsx";
import TagEditorParam from "./TagEditorParam.jsx";
import TagEditorHelp from "./TagEditorHelp.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";

import cx from "classnames";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type { DatasetQuery } from "metabase/meta/types/Card"
import type { TableId } from "metabase/meta/types/Table"
import type { TemplateTag } from "metabase/meta/types/Query"
import type { Field as FieldObject } from "metabase/meta/types/Field"

type Props = {
    query: NativeQuery,

    setDatasetQuery: (datasetQuery: DatasetQuery) => void,
    updateTemplateTag: (tag: TemplateTag) => void,

    databaseFields: FieldObject[],
    sampleDatasetId: TableId,

    onClose: () => void,
}
type State = {
    section: "help"|"settings";
}

export default class TagEditorSidebar extends Component {
    props: Props;
    state: State = {
        section: "settings"
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        onClose: PropTypes.func.isRequired,
        updateTemplateTag: PropTypes.func.isRequired,
        databaseFields: PropTypes.array,
        setDatasetQuery: PropTypes.func.isRequired,
        sampleDatasetId: PropTypes.number,
    };

    setSection (section) {
        this.setState({ section: section });
        MetabaseAnalytics.trackEvent("QueryBuilder", "Template Tag Editor Section Change", section)
    }

    render() {
        const { query } = this.props;
        const tags = query.templateTags()

        let section;
        if (tags.length === 0) {
            section = "help";
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
                        <Icon name="close" size={18} />
                    </a>
                </div>
                <div className="DataReference-content">
                    <div className="Button-group Button-group--brand text-uppercase mb2">
                        <a className={cx("Button Button--small", { "Button--active": section === "settings" , "disabled": tags.length === 0 })} onClick={() => this.setSection("settings")}>Settings</a>
                        <a className={cx("Button Button--small", { "Button--active": section === "help" })} onClick={() => this.setSection("help")}>Help</a>
                    </div>
                    { section === "settings" ?
                        <SettingsPane tags={tags} onUpdate={this.props.updateTemplateTag} databaseFields={this.props.databaseFields}/>
                    :
                        <TagEditorHelp sampleDatasetId={this.props.sampleDatasetId} setDatasetQuery={this.props.setDatasetQuery}/>
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
