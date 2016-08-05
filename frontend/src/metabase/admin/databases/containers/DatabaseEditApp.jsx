import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import MetabaseSettings from "metabase/lib/settings";
import DeleteDatabaseModal from "../components/DeleteDatabaseModal.jsx";
import DatabaseEditForms from "../components/DatabaseEditForms.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx"
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import {
    getEditingDatabase,
    getFormState
} from "../selectors";
import * as databaseActions from "../database";


const mapStateToProps = (state, props) => {
    return {
        databaseId:       props.params.databaseId,
        database:         getEditingDatabase(state),
        formState:        getFormState(state)
    }
}

const mapDispatchToProps = {
    ...databaseActions,
}

@connect(mapStateToProps, mapDispatchToProps)
export default class DatabaseEditApp extends Component {
    static propTypes = {
        database: PropTypes.object,
        syncDatabase: PropTypes.func.isRequired,
        deleteDatabase: PropTypes.func.isRequired,
        saveDatabase: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.initializeDatabase(this.props.databaseId);
    }

    render() {
        let { database } = this.props;

        return (
            <div className="wrapper">
                <Breadcrumbs crumbs={[
                    ["Databases", "/admin/databases"],
                    [database && database.id != null ? database.name : "Add Database"]
                ]} />
                <section className="Grid Grid--gutters Grid--2-of-3">
                    <div className="Grid-cell">
                        <div className="Form-new bordered rounded shadowed">
                            <DatabaseEditForms
                                database={database}
                                details={database ? database.details : null}
                                engines={MetabaseSettings.get('engines')}
                                hiddenFields={{ssl: true}}
                                formState={this.props.formState}
                                selectEngine={this.props.selectEngine}
                                save={this.props.saveDatabase}
                            />
                        </div>
                    </div>

                    { /* Sidebar Actions */ }
                    { database && database.id != null &&
                        <div className="Grid-cell Cell--1of3">
                            <div className="Actions  bordered rounded shadowed">
                                <h3>Actions</h3>
                                <div className="Actions-group">
                                    <ActionButton
                                        actionFn={() => this.props.syncDatabase(database.id)}
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
                                            onDelete={() => this.props.deleteDatabase(database.id, true)}
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
