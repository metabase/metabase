/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { connect } from 'react-redux';
import { reduxForm } from "redux-form";

import cx from "classnames";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import CreateDashboardModal from 'metabase/components/CreateDashboardModal.jsx';
import Modal from 'metabase/components/Modal.jsx';

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideHeader from "metabase/reference/components/GuideHeader.jsx";
import GuideEditSection from "metabase/reference/components/GuideEditSection.jsx";
import GuideDetail from "metabase/reference/components/GuideDetail.jsx";
import GuideDetailEditor from "metabase/reference/components/GuideDetailEditor.jsx";

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';
import { clearRequestState } from "metabase/redux/requests";
import { createDashboard, updateDashboard } from 'metabase/dashboards/dashboards';

import {
    updateSetting
} from 'metabase/admin/settings/settings';

import S from "../components/GuideDetailEditor.css";

import {
    getGuide,
    getUser,
    getDashboards,
    getLoading,
    getError,
    getIsEditing,
    getIsDashboardModalOpen,
    getDatabases,
    getTables,
    getFields,
    getMetrics,
    getSegments,
} from '../selectors';

import {
    getQuestionUrl,
    has,
    isGuideEmpty,
    tryUpdateGuide
} from '../utils';

const mapStateToProps = (state, props) => {
    const guide = getGuide(state, props);
    const dashboards = getDashboards(state, props);
    const metrics = getMetrics(state, props);
    const segments = getSegments(state, props);
    const tables = getTables(state, props);
    const fields = getFields(state, props);
    const databases = getDatabases(state, props);

    // redux-form populates fields with stale values after update
    // if we dont specify nulls here
    // could use a lot of refactoring
    const initialValues = guide && {
        things_to_know: guide.things_to_know || null,
        contact: guide.contact || {name: null, email: null},
        most_important_dashboard: dashboards !== null && guide.most_important_dashboard !== null ?
            dashboards[guide.most_important_dashboard] :
            {},
        important_metrics: guide.important_metrics && guide.important_metrics.length > 0 ?
            guide.important_metrics
                .map(metricId => metrics[metricId] && {
                    ...metrics[metricId],
                    important_fields: guide.metric_important_fields[metricId] && guide.metric_important_fields[metricId].map(fieldId => fields[fieldId])
                }) :
            [],
        important_segments_and_tables:
            (guide.important_segments && guide.important_segments.length > 0) ||
            (guide.important_tables && guide.important_tables.length > 0) ?
                guide.important_segments
                    .map(segmentId => segments[segmentId] && { ...segments[segmentId], type: 'segment' })
                    .concat(guide.important_tables
                        .map(tableId => tables[tableId] && { ...tables[tableId], type: 'table' })
                    ) :
                []
    };

    return {
        guide,
        user: getUser(state, props),
        dashboards,
        metrics,
        segments,
        tables,
        databases,
        // FIXME: avoids naming conflict, tried using the propNamespace option
        // version but couldn't quite get it to work together with passing in
        // dynamic initialValues
        metadataFields: fields,
        loading: getLoading(state, props),
        // naming this 'error' will conflict with redux form
        loadingError: getError(state, props),
        isEditing: getIsEditing(state, props),
        isDashboardModalOpen: getIsDashboardModalOpen(state, props),
        // redux form doesn't pass this through to component
        // need to use to reset form field arrays
        initialValues: initialValues,
        initialFormValues: initialValues
    };
};

const mapDispatchToProps = {
    updateDashboard,
    createDashboard,
    updateSetting,
    clearRequestState,
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'guide',
    fields: [
        'things_to_know',
        'contact.name',
        'contact.email',
        'most_important_dashboard.id',
        'most_important_dashboard.caveats',
        'most_important_dashboard.points_of_interest',
        'important_metrics[].id',
        'important_metrics[].caveats',
        'important_metrics[].points_of_interest',
        'important_metrics[].important_fields',
        'important_segments_and_tables[].id',
        'important_segments_and_tables[].type',
        'important_segments_and_tables[].caveats',
        'important_segments_and_tables[].points_of_interest'
    ]
})
export default class ReferenceGettingStartedGuide extends Component {
    static propTypes = {
        fields: PropTypes.object,
        style: PropTypes.object,
        guide: PropTypes.object,
        user: PropTypes.object,
        dashboards: PropTypes.object,
        metrics: PropTypes.object,
        segments: PropTypes.object,
        tables: PropTypes.object,
        databases: PropTypes.object,
        metadataFields: PropTypes.object,
        loadingError: PropTypes.any,
        loading: PropTypes.bool,
        isEditing: PropTypes.bool,
        startEditing: PropTypes.func,
        endEditing: PropTypes.func,
        handleSubmit: PropTypes.func,
        submitting: PropTypes.bool,
        initialFormValues: PropTypes.object,
        initializeForm: PropTypes.func,
        createDashboard: PropTypes.func,
        isDashboardModalOpen: PropTypes.bool,
        showDashboardModal: PropTypes.func,
        hideDashboardModal: PropTypes.func,
    };

    render() {
        const {
            fields: {
                things_to_know,
                contact,
                most_important_dashboard,
                important_metrics,
                important_segments_and_tables
            },
            style,
            guide,
            user,
            dashboards,
            metrics,
            segments,
            tables,
            databases,
            metadataFields,
            loadingError,
            loading,
            isEditing,
            startEditing,
            endEditing,
            handleSubmit,
            submitting,
            initialFormValues,
            initializeForm,
            createDashboard,
            isDashboardModalOpen,
            showDashboardModal,
            hideDashboardModal,
        } = this.props;

        const onSubmit = handleSubmit(async (fields) =>
            await tryUpdateGuide(fields, this.props)
        );

        const getSelectedIds = fields => fields
            .map(field => field.id.value)
            .filter(id => id !== null);

        const getSelectedIdTypePairs = fields => fields
            .map(field => [field.id.value, field.type.value])
            .filter(idTypePair => idTypePair[0] !== null);


        return (
            <form className="full relative py4" style={style} onSubmit={onSubmit}>
                { isDashboardModalOpen &&
                    <Modal>
                        <CreateDashboardModal
                            createDashboardFn={async (newDashboard) => {
                                try {
                                    await createDashboard(newDashboard, { redirect: true });
                                }
                                catch(error) {
                                    console.error(error);
                                }
                            }}
                            onClose={hideDashboardModal}
                        />
                    </Modal>
                }
                { isEditing &&
                    <EditHeader
                        endEditing={endEditing}
                        // resetForm doesn't reset field arrays
                        reinitializeForm={() => initializeForm(initialFormValues)}
                        submitting={submitting}
                    />
                }
                <LoadingAndErrorWrapper className="full" style={style} loading={!loadingError && loading} error={loadingError}>
                { () => isEditing ?
                    <div className="wrapper wrapper--trim">
                        <div className="mt4 py2">
                            <h1 className="my3 text-dark">
                                Help new Metabase users find their way around.
                            </h1>
                            <p className="text-paragraph text-measure">
                                The Getting Started guide highlights the dashboard,
                                metrics, segments, and tables that matter most,
                                and informs your users of important things they
                                should know before digging into the data.
                            </p>
                        </div>

                        <GuideEditSection
                            isCollapsed={most_important_dashboard.id.value === undefined}
                            isDisabled={!dashboards || Object.keys(dashboards).length === 0}
                            collapsedTitle="Is there an important dashboard for your team?"
                            collapsedIcon="dashboard"
                            linkMessage="Create a dashboard now"
                            action={showDashboardModal}
                            expand={() => most_important_dashboard.id.onChange(null)}
                        >
                            <div>
                                <SectionHeader>
                                    What is your most important dashboard?
                                </SectionHeader>
                                <GuideDetailEditor
                                    type="dashboard"
                                    entities={dashboards}
                                    selectedIds={[most_important_dashboard.id.value]}
                                    formField={most_important_dashboard}
                                    removeField={() => {
                                        most_important_dashboard.id.onChange(null);
                                        most_important_dashboard.points_of_interest.onChange('');
                                        most_important_dashboard.caveats.onChange('');
                                    }}
                                />
                            </div>
                        </GuideEditSection>

                        <GuideEditSection
                            isCollapsed={important_metrics.length === 0}
                            isDisabled={!metrics || Object.keys(metrics).length === 0}
                            collapsedTitle="Do you have any commonly referenced metrics?"
                            collapsedIcon="ruler"
                            linkMessage="Learn how to define a metric"
                            link="http://www.metabase.com/docs/latest/administration-guide/05-segments-and-metrics#creating-a-metric"
                            expand={() => important_metrics.addField({id: null, caveats: null, points_of_interest: null, important_fields: null})}
                        >
                            <div className="my2">
                                <SectionHeader>
                                    What are your 3-5 most commonly referenced metrics?
                                </SectionHeader>
                                <div>
                                    { important_metrics.map((metricField, index, metricFields) =>
                                        <GuideDetailEditor
                                            key={index}
                                            type="metric"
                                            metadata={{
                                                tables,
                                                metrics,
                                                fields: metadataFields,
                                                metricImportantFields: guide.metric_important_fields
                                            }}
                                            entities={metrics}
                                            formField={metricField}
                                            selectedIds={getSelectedIds(metricFields)}
                                            removeField={() => {
                                                if (metricFields.length > 1) {
                                                    return metricFields.removeField(index);
                                                }
                                                metricField.id.onChange(null);
                                                metricField.points_of_interest.onChange('');
                                                metricField.caveats.onChange('');
                                                metricField.important_fields.onChange(null);
                                            }}
                                        />
                                    )}
                                </div>
                                { important_metrics.length < 5 &&
                                    important_metrics.length < Object.keys(metrics).length &&
                                        <button
                                            className="Button Button--primary Button--large"
                                            type="button"
                                            onClick={() => important_metrics.addField({id: null, caveats: null, points_of_interest: null})}
                                        >
                                            Add another metric
                                        </button>
                                }
                            </div>
                        </GuideEditSection>

                        <GuideEditSection
                            isCollapsed={important_segments_and_tables.length === 0}
                            isDisabled={(!segments || Object.keys(segments).length === 0) && (!tables || Object.keys(tables).length === 0)}
                            showLink={!segments || Object.keys(segments).length === 0}
                            collapsedTitle="Do you have any commonly referenced segments or tables?"
                            collapsedIcon="table2"
                            linkMessage="Learn how to create a segment"
                            link="http://www.metabase.com/docs/latest/administration-guide/05-segments-and-metrics#creating-a-segment"
                            expand={() => important_segments_and_tables.addField({id: null, type: null, caveats: null, points_of_interest: null})}
                        >
                            <div>
                                <h2 className="text-measure text-dark">
                                    What are 3-5 commonly referenced segments or tables
                                    that would be useful for this audience?
                                </h2>
                                <div className="mb2">
                                    { important_segments_and_tables.map((segmentOrTableField, index, segmentOrTableFields) =>
                                        <GuideDetailEditor
                                            key={index}
                                            type="segment"
                                            metadata={{
                                                databases,
                                                tables,
                                                segments
                                            }}
                                            formField={segmentOrTableField}
                                            selectedIdTypePairs={getSelectedIdTypePairs(segmentOrTableFields)}
                                            removeField={() => {
                                                if (segmentOrTableFields.length > 1) {
                                                    return segmentOrTableFields.removeField(index);
                                                }
                                                segmentOrTableField.id.onChange(null);
                                                segmentOrTableField.type.onChange(null);
                                                segmentOrTableField.points_of_interest.onChange('');
                                                segmentOrTableField.caveats.onChange('');
                                            }}
                                        />
                                    )}
                                </div>
                                { important_segments_and_tables.length < 5 &&
                                    important_segments_and_tables.length < Object.keys(tables).concat(Object.keys.segments).length &&
                                        <button
                                            className="Button Button--primary Button--large"
                                            type="button"
                                            onClick={() => important_segments_and_tables.addField({id: null, type: null, caveats: null, points_of_interest: null})}
                                        >
                                            Add another segment or table
                                        </button>
                                }
                            </div>
                        </GuideEditSection>

                        <GuideEditSection
                            isCollapsed={things_to_know.value === null}
                            isDisabled={false}
                            collapsedTitle="Is there anything your users should understand or know before they start accessing the data?"
                            collapsedIcon="reference"
                            expand={() => things_to_know.onChange('')}
                        >
                            <div className="text-measure">
                                <SectionHeader>
                                    What should a user of this data know before they start
                                    accessing it?
                                </SectionHeader>
                                <textarea
                                    className={S.guideDetailEditorTextarea}
                                    placeholder="E.g., expectations around data privacy and use,
                                        common pitfalls or misunderstandings, information about
                                        data warehouse performance, legal notices, etc."
                                    {...things_to_know}
                                />
                            </div>
                        </GuideEditSection>

                        <GuideEditSection
                            isCollapsed={contact.name.value === null && contact.email.value === null}
                            isDisabled={false}
                            collapsedTitle="Is there someone your users could contact for help if they're confused about this guide?"
                            collapsedIcon="mail"
                            expand={() => {
                                contact.name.onChange('');
                                contact.email.onChange('');
                            }}
                        >
                            <div>
                                <SectionHeader>
                                    Who should users contact for help if they're confused about this data?
                                </SectionHeader>
                                <div className="flex">
                                    <div className="flex-full">
                                        <h3 className="mb1">Name</h3>
                                        <input
                                            className="input text-paragraph"
                                            placeholder="Julie McHelpfulson"
                                            type="text"
                                            {...contact.name}
                                        />
                                    </div>
                                    <div className="flex-full">
                                        <h3 className="mb1">Email address</h3>
                                        <input
                                            className="input text-paragraph"
                                            placeholder="julie.mchelpfulson@acme.com"
                                            type="text"
                                            {...contact.email}
                                        />
                                    </div>
                                </div>
                            </div>
                        </GuideEditSection>
                    </div> :
                    <div>
                        <GuideHeader
                            startEditing={startEditing}
                            isSuperuser={user && user.is_superuser}
                        />

                        <div className="wrapper wrapper--trim">
                            { (!guide || isGuideEmpty(guide)) && user && user.is_superuser && (
                                <AdminInstructions>
                                    <h2 className="py2">Help your team get started with your data.</h2>
                                    <GuideText>
                                        Show your team what’s most important by choosing your top dashboard, metrics, and segments.
                                    </GuideText>
                                    <button
                                        className="Button Button--primary"
                                        onClick={startEditing}
                                    >
                                        Get started
                                    </button>
                                </AdminInstructions>
                            )}

                            { guide.most_important_dashboard !== null && [
                                <div className="my2">
                                    <SectionHeader key={'dashboardTitle'}>
                                        Our most important dashboard
                                    </SectionHeader>
                                    <GuideDetail
                                        key={'dashboardDetail'}
                                        type="dashboard"
                                        entity={dashboards[guide.most_important_dashboard]}
                                        tables={tables}
                                    />
                                </div>
                            ]}
                            { Object.keys(metrics).length > 0  && (
                                    <div className="my4 pt4">
                                        <SectionHeader trim={guide.important_metrics.length === 0}>
                                            { guide.important_metrics && guide.important_metrics.length > 0 ? 'Numbers that we pay attention to' : 'Metrics' }
                                        </SectionHeader>
                                        { (guide.important_metrics && guide.important_metrics.length > 0) ? [
                                            <div className="my2">
                                                { guide.important_metrics.map((metricId) =>
                                                    <GuideDetail
                                                        key={metricId}
                                                        type="metric"
                                                        entity={metrics[metricId]}
                                                        tables={tables}
                                                        exploreLinks={guide.metric_important_fields[metricId] &&
                                                            guide.metric_important_fields[metricId]
                                                                .map(fieldId => metadataFields[fieldId])
                                                                .map(field => ({
                                                                    name: field.display_name || field.name,
                                                                    url: getQuestionUrl({
                                                                        dbId: tables[field.table_id] && tables[field.table_id].db_id,
                                                                        tableId: field.table_id,
                                                                        fieldId: field.id,
                                                                        metricId
                                                                    })
                                                                }))
                                                        }
                                                    />
                                                )}
                                            </div>
                                        ] :
                                            <GuideText>
                                                Metrics are important numbers your company cares about. They often represent a core indicator of how the business is performing.
                                            </GuideText>
                                        }
                                        <div>
                                            <Link className="Button Button--primary" to={'/reference/metrics'}>
                                                See all metrics
                                            </Link>
                                        </div>
                                    </div>
                                )
                            }

                            <div className="mt4 pt4">
                                <SectionHeader trim={(!has(guide.important_segments) && !has(guide.important_tables))}>
                                    { Object.keys(segments).length > 0 ? 'Segments and tables' : 'Tables' }
                                </SectionHeader>
                                { has(guide.important_segments) || has(guide.important_tables) ?
                                    <div className="my2">
                                        { guide.important_segments.map((segmentId) =>
                                            <GuideDetail
                                                key={segmentId}
                                                type="segment"
                                                entity={segments[segmentId]}
                                                tables={tables}
                                            />
                                        )}
                                        { guide.important_tables.map((tableId) =>
                                            <GuideDetail
                                                key={tableId}
                                                type="table"
                                                entity={tables[tableId]}
                                                tables={tables}
                                            />
                                        )}
                                    </div>
                                :
                                    <GuideText>
                                        { Object.keys(segments).length > 0 ? (
                                            <span>
                                                Segments and tables are the building blocks of your company's data. Tables are collections of the raw information while segments are specific slices with specific meanings, like <b>"Recent orders."</b>
                                            </span>
                                        ) : "Tables are the building blocks of your company's data."
                                        }
                                    </GuideText>
                                }
                                <div>
                                    { Object.keys(segments).length > 0 && (
                                        <Link className="Button Button--purple mr2" to={'/reference/segments'}>
                                            See all segments
                                        </Link>
                                    )}
                                    <Link
                                        className={cx(
                                            { 'text-purple text-bold no-decoration text-underline-hover' : Object.keys(segments).length > 0 },
                                            { 'Button Button--purple' : Object.keys(segments).length === 0 }
                                        )}
                                        to={'/reference/databases'}
                                    >
                                        See all tables
                                    </Link>
                                </div>
                            </div>

                            <div className="mt4 pt4">
                                <SectionHeader trim={!guide.things_to_know}>
                                    { guide.things_to_know ? 'Other things to know about our data' : 'Find out more' }
                                </SectionHeader>
                                <GuideText>
                                    { guide.things_to_know ? guide.things_to_know : "A good way to get to know your data is by spending a bit of time exploring the different tables and other info available to you. It may take a while, but you'll start to recognize names and meanings over time."
                                    }
                                </GuideText>
                                <Link className="Button link text-bold" to={'/reference/databases'}>
                                    Explore our data
                                </Link>
                            </div>

                            <div className="mt4">
                                { guide.contact && (guide.contact.name || guide.contact.email) && [
                                    <SectionHeader key={'contactTitle'}>
                                        Have questions?
                                    </SectionHeader>,
                                    <div className="mb4 pb4" key={'contactDetails'}>
                                            { guide.contact.name &&
                                                <span className="text-dark mr3">
                                                    {`Contact ${guide.contact.name}`}
                                                </span>
                                            }
                                            { guide.contact.email &&
                                                <a className="text-brand text-bold no-decoration" href={`mailto:${guide.contact.email}`}>
                                                    {guide.contact.email}
                                                </a>
                                            }
                                    </div>
                                ]}
                            </div>
                        </div>
                    </div>
                }
                </LoadingAndErrorWrapper>
            </form>
        );
    }
}

const GuideText = ({ children }) => // eslint-disable-line react/prop-types
    <p className="text-paragraph text-measure">{children}</p>

const AdminInstructions = ({ children }) => // eslint-disable-line react/prop-types
    <div className="bordered border-brand rounded p3 text-brand text-measure text-centered bg-light-blue">
        {children}
    </div>

const SectionHeader = ({ trim, children }) => // eslint-disable-line react/prop-types
    <h2 className={cx('text-dark text-measure', {  "mb0" : trim }, { "mb4" : !trim })}>{children}</h2>
