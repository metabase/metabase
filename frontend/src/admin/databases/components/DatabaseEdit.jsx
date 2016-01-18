import React, { Component, PropTypes } from "react";

import DeleteDatabaseModal from "./DeleteDatabaseModal.jsx";
import DatabaseEditForms from "./DatabaseEditForms.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx"
import Icon from "metabase/components/Icon.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

export default class DatabaseEdit extends Component {
    static propTypes = {
        database: PropTypes.object,
        details: PropTypes.object,
        sync: PropTypes.func.isRequired,
        delete: PropTypes.func.isRequired,
        save: PropTypes.func.isRequired
    };

    render() {
        let { database } = this.props;
        return (
            <div className="wrapper">
                <Breadcrumbs crumbs={[
                    ["Databases", "/admin/databases/"],
                    [database && database.id != null ? database.name : "Add Database"]
                ]} />
                <section className="Grid Grid--gutters Grid--2-of-3">
                    <div className="Grid-cell">
                        <div className="Form-new bordered rounded shadowed">
                            <DatabaseEditForms {...this.props} />
                        </div>
                    </div>

                    { /* Sidebar Actions */ }
                    { database && database.id != null &&
                        <div className="Grid-cell Cell--1of3" ng-if="database.id">
                            <div className="Actions  bordered rounded shadowed">
                                <h3>Actions</h3>
                                <div className="Actions-group">
                                    <ActionButton
                                        actionFn={() => this.props.sync()}
                                        className="Button"
                                        normalText="Sync"
                                        activeText="Starting…"
                                        failedText="Failed to sync"
                                        successText="Sync triggered!"
                                    />
                                </div>

                                <div className="Actions-group Actions--dangerZone">
                                    <label className="Actions-groupLabel block">Danger Zone:</label>
                                    <ModalWithTrigger
                                        ref="deleteDatabaseModal"
                                        triggerClasses="Button Button--danger"
                                        triggerElement="Remove this database"
                                    >
                                        <DeleteDatabaseModal
                                            database={database}
                                            onClose={() => this.refs.deleteDatabaseModal.toggle()}
                                            onDelete={() => this.props.delete(database.id)}
                                        />
                                    </ModalWithTrigger>
                                </div>
                            </div>
                        </div>
                    }
                </section>
            </div>
        );
    }
}
