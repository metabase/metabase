/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import title from "metabase/hoc/Title";
import cx from "classnames";

import MetabaseSettings from "metabase/lib/settings";
import DeleteDatabaseModal from "../components/DeleteDatabaseModal.jsx";
import DatabaseEditForms from "../components/DatabaseEditForms.jsx";
import DatabaseSchedulingForm from "../components/DatabaseSchedulingForm";

import ActionButton from "metabase/components/ActionButton.jsx";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx"
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import {
    getEditingDatabase,
    getFormState
} from "../selectors";

import {
    reset,
    initializeDatabase,
    saveDatabase,
    syncDatabaseSchema,
    rescanDatabaseFields,
    discardSavedFieldValues,
    deleteDatabase,
    selectEngine
} from "../database";
import ConfirmContent from "metabase/components/ConfirmContent";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

const mapStateToProps = (state, props) => ({
    database:  getEditingDatabase(state, props),
    formState: getFormState(state, props)
});

export const Tab = ({ name, setTab, currentTab }) =>
    <div
        className={cx('cursor-pointer py3', {'text-brand': currentTab === name.toLowerCase() })}
        onClick={() => setTab(name)}>
        <h3>{name}</h3>
    </div>

export const Tabs = ({ currentTab, setTab }) =>
    <div className="border-bottom">
        <ol className="Form-offset flex align center">
            {['Connection', 'Scheduling'].map((tab, index) =>
                <li key={index}>
                    <Tab
                        name={tab}
                        setTab={setTab}
                        currentTab={currentTab}
                    />
                </li>
            )}
        </ol>
    </div>

const mapDispatchToProps = {
    reset,
    initializeDatabase,
    saveDatabase,
    syncDatabaseSchema,
    rescanDatabaseFields,
    discardSavedFieldValues,
    deleteDatabase,
    selectEngine
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ database }) => database && database.name)
export default class DatabaseEditApp extends Component {

    state = {
        currentTab: 'scheduling'
    }

    static propTypes = {
        database: PropTypes.object,
        formState: PropTypes.object.isRequired,
        params: PropTypes.object.isRequired,
        reset: PropTypes.func.isRequired,
        initializeDatabase: PropTypes.func.isRequired,
        syncDatabaseSchema: PropTypes.func.isRequired,
        rescanDatabaseFields: PropTypes.func.isRequired,
        discardSavedFieldValues: PropTypes.func.isRequired,
        deleteDatabase: PropTypes.func.isRequired,
        saveDatabase: PropTypes.func.isRequired,
        selectEngine: PropTypes.func.isRequired,
    };

    async componentWillMount() {
        await this.props.reset();
        await this.props.initializeDatabase(this.props.params.databaseId);
    }

    render() {
        let { database } = this.props;
        const { currentTab } = this.state;

        return (
            <div className="wrapper">
                <Breadcrumbs className="py4" crumbs={[
                    ["Databases", "/admin/databases"],
                    [database && database.id != null ? database.name : "Add Database"]
                ]} />
                <section className="Grid Grid--gutters Grid--2-of-3">
                    <div className="Grid-cell">
                        <div className="Form-new bordered rounded shadowed pt0">
                            <Tabs
                                currentTab={currentTab}
                                setTab={tab => this.setState({ currentTab: tab.toLowerCase() })}
                            />
                            <LoadingAndErrorWrapper loading={!database} error={null}>
                                { () =>
                                    <div>
                                        { currentTab === 'connection' &&
                                        <DatabaseEditForms
                                            database={database}
                                            details={database ? database.details : null}
                                            engines={MetabaseSettings.get('engines')}
                                            hiddenFields={{ssl: true}}
                                            formState={this.props.formState}
                                            selectEngine={this.props.selectEngine}
                                            save={this.props.saveDatabase}
                                        />
                                        }
                                        { currentTab === 'scheduling' &&
                                        <DatabaseSchedulingForm
                                            database={database}
                                            formState={this.props.formState}
                                            save={this.props.saveDatabase}
                                        />
                                        }
                                    </div>
                                }
                            </LoadingAndErrorWrapper>
                        </div>
                    </div>

                    { /* Sidebar Actions */ }
                    { database && database.id != null &&
                        <div className="Grid-cell Cell--1of3">
                            <div className="Actions  bordered rounded shadowed">
                                <div className="Actions-group">
                                    <label className="Actions-groupLabel block text-bold">Actions</label>
                                    <ol>
                                        <li>
                                            <ActionButton
                                                actionFn={() => this.props.syncDatabaseSchema(database.id)}
                                                className="Button Button--syncDbSchema"
                                                normalText="Sync database schema now"
                                                activeText="Starting…"
                                                failedText="Failed to sync"
                                                successText="Sync triggered!"
                                            />
                                        </li>
                                        <li>
                                            <ActionButton
                                                actionFn={() => this.props.rescanDatabaseFields(database.id)}
                                                className="Button Button--rescanFieldValues"
                                                normalText="Re-scan field values now"
                                                activeText="Starting…"
                                                failedText="Failed to start scan"
                                                successText="Scan triggered!"
                                            />
                                        </li>
                                    </ol>
                                </div>

                                <div className="Actions-group Actions--dangerZone">
                                    <label className="Actions-groupLabel block text-bold">Danger Zone:</label>
                                    <ModalWithTrigger
                                        ref="discardSavedFieldValuesModal"
                                        triggerClasses="Button Button--danger Button--discardSavedFieldValues"
                                        triggerElement="Discard saved field values"
                                    >
                                        <ConfirmContent
                                            title="Discard saved field values"
                                            onClose={() => this.refs.discardSavedFieldValuesModal.toggle()}
                                            onAction={() => this.props.discardSavedFieldValues(database.id)}
                                        />
                                    </ModalWithTrigger>
                                    <ModalWithTrigger
                                        ref="deleteDatabaseModal"
                                        triggerClasses="Button Button--deleteDatabase Button--danger"
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
