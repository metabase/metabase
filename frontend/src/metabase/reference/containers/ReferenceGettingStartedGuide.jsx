/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import { connect } from 'react-redux';
import { push } from 'react-router-redux';
import { reduxForm } from "redux-form";
import i from "icepick";
import cx from "classnames";

import S from "metabase/reference/Reference.css";

import {
    getQuestionUrl
} from '../utils';

import MetabaseAnalytics from "metabase/lib/analytics";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import CreateDashboardModal from 'metabase/components/CreateDashboardModal.jsx';
import Modal from 'metabase/components/Modal.jsx';

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx";
import GuideHeader from "metabase/reference/components/GuideHeader.jsx";
import GuideEditSection from "metabase/reference/components/GuideEditSection.jsx";
import GuideDetail from "metabase/reference/components/GuideDetail.jsx";
import GuideDetailEditor from "metabase/reference/components/GuideDetailEditor.jsx";

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';
import { clearRequestState } from "metabase/redux/requests";
import {
    updateDashboard,
    createDashboard
} from 'metabase/dashboard/dashboard';

import {
    updateSetting
} from 'metabase/admin/settings/settings';

import {
    getGuide,
    getUser,
    getDashboards,
    getMetrics,
    getSegments,
    getTables,
    getFields,
    getDatabases,
    getLoading,
    getError,
    getIsEditing,
    getIsDashboardModalOpen
} from '../selectors';

import {
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
        most_important_dashboard: guide.most_important_dashboard !== null ?
            dashboards[guide.most_important_dashboard] :
            {},
        important_metrics: guide.important_metrics && guide.important_metrics.length > 0 ? 
            guide.important_metrics
                .map(metricId => metrics[metricId] && i.assoc(metrics[metricId], 'important_fields', guide.metric_important_fields[metricId] && guide.metric_important_fields[metricId].map(fieldId => fields[fieldId]))) :
            [],
        important_segments_and_tables: 
            (guide.important_segments && guide.important_segments.length > 0) ||
            (guide.important_tables && guide.important_tables.length > 0) ? 
                guide.important_segments
                    .map(segmentId => segments[segmentId] && i.assoc(segments[segmentId], 'type', 'segment'))
                    .concat(guide.important_tables
                        .map(tableId => tables[tableId] && i.assoc(tables[tableId], 'type', 'table'))
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
    push,
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
        initializeForm: PropTypes.func
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
            push
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
            <form className="full" style={style} onSubmit={onSubmit}>
                { isDashboardModalOpen &&
                    <Modal>
                        <CreateDashboardModal
                            createDashboardFn={async (newDashboard) => {
                                try {
                                    const action = await createDashboard(newDashboard, true);
                                    push(`/dash/${action.payload.id}`);
                                }
                                catch(error) {
                                    console.error(error);
                                }

                                MetabaseAnalytics.trackEvent("Dashboard", "Create");
                            }}
                            closeFn={hideDashboardModal} 
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
                    <div className={cx("wrapper wrapper--trim", S.guideWrapper)}>
                        <div className={S.guideEditHeader}>
                            <div className={S.guideEditHeaderTitle}>
                                Help new Metabase users find their way around
                            </div>
                            <div className={S.guideEditHeaderDescription}>
                                The Getting Started guide highlights the dashboard, 
                                metrics, segments, and tables that matter most, 
                                and informs your users of important things they 
                                should know before digging into the data.
                            </div>
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
                            <div className={S.guideEditSection}>
                                <div className={S.guideEditTitle}>
                                    What is your most important dashboard?
                                </div>
                                <div className={S.guideEditCards}>
                                    <GuideDetailEditor 
                                        className={S.guideEditCard}
                                        editLabelClasses={S.guideEditLabel}
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
                            <div className={S.guideEditSection}>
                                <div className={S.guideEditTitle}>
                                    What are your 3-5 most commonly referenced metrics?
                                </div>
                                <div className={S.guideEditCards}>
                                    { important_metrics.map((metricField, index, metricFields) =>
                                        <GuideDetailEditor 
                                            key={index}
                                            editLabelClasses={S.guideEditLabel}
                                            className={S.guideEditCard}
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
                                    <div className={S.guideEditAddButton}>
                                        <div className={S.guideEditAddButtonBody}>
                                            <button
                                                className="Button Button--primary Button--large" 
                                                type="button"
                                                onClick={() => important_metrics.addField({id: null, caveats: null, points_of_interest: null})}
                                            >
                                                Add another metric
                                            </button>
                                        </div>
                                    </div>
                                }
                            </div>
                        </GuideEditSection>

                        <GuideEditSection
                            isCollapsed={important_segments_and_tables.length === 0}
                            isDisabled={(!segments || Object.keys(segments).length === 0) && (!tables || Object.keys(tables).length === 0)}
                            collapsedTitle="Do you have any commonly referenced segments or tables?"
                            collapsedIcon="table2"
                            linkMessage="Learn how to create a segment"
                            link="http://www.metabase.com/docs/latest/administration-guide/05-segments-and-metrics#creating-a-segment"
                            expand={() => important_segments_and_tables.addField({id: null, type: null, caveats: null, points_of_interest: null})}
                        >
                            <div className={S.guideEditSection}>
                                <div className={S.guideEditTitle}>
                                    What are 3-5 commonly referenced segments or tables 
                                    that would be useful for this audience?
                                </div>
                                <div className={S.guideEditCards}>
                                    { important_segments_and_tables.map((segmentOrTableField, index, segmentOrTableFields) =>
                                        <GuideDetailEditor 
                                            key={index}
                                            editLabelClasses={S.guideEditLabel}
                                            className={S.guideEditCard}
                                            type="segment or table"
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
                                    <div className={S.guideEditAddButton}>
                                        <div className={S.guideEditAddButtonBody}>
                                            <button
                                                className="Button Button--primary Button--large" 
                                                type="button"
                                                onClick={() => important_segments_and_tables.addField({id: null, type: null, caveats: null, points_of_interest: null})}
                                            >
                                                Add another segment or table
                                            </button>
                                        </div>
                                    </div>
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
                            <div className={S.guideEditSection}>
                                <div className={S.guideEditTitle}>
                                    What should a user of this data know before they start 
                                    accessing it?
                                </div>
                                <div className={S.guideEditCards}>
                                    <div className={S.guideEditCard}>
                                        <span className={S.guideEditLabel}>
                                            Things to know
                                        </span>
                                        <textarea 
                                            className={S.guideEditTextarea} 
                                            placeholder="E.g., expectations around data privacy and use, 
                                                common pitfalls or misunderstandings, information about 
                                                data warehouse performance, legal notices, etc."
                                            {...things_to_know}
                                        />
                                    </div>
                                </div>
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
                            <div className={S.guideEditSection}>
                                <div className={S.guideEditTitle}>
                                    Who should users contact for help if they're confused about this data?
                                </div>
                                <div className={S.guideEditCards}>
                                    <div className={S.guideEditCard}>
                                        <div className={S.guideEditContact}>
                                            <div className={S.guideEditContactName}>
                                                <span className={S.guideEditLabel}>
                                                    Name
                                                </span>
                                                <input 
                                                    className={S.guideEditInput} 
                                                    placeholder="Julie McHelpfulson" 
                                                    type="text"
                                                    {...contact.name}
                                                />
                                            </div>
                                            <div className={S.guideEditContactEmail}>
                                                <span className={S.guideEditLabel}>
                                                    Email address
                                                </span>
                                                <input 
                                                    className={S.guideEditInput} 
                                                    placeholder="julie.mchelpfulson@acme.com" 
                                                    type="text"
                                                    {...contact.email}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </GuideEditSection>
                    </div> :
                    !guide || isGuideEmpty(guide) ? 
                        <GuideEmptyState 
                            isSuperuser={user && user.is_superuser}
                            startEditing={startEditing} 
                        /> : 
                        <div>
                            <GuideHeader startEditing={startEditing} />
                            <div className={cx("wrapper wrapper--trim", S.guideWrapper)}>
                                { guide.most_important_dashboard !== null && [
                                    <div key={'dashboardTitle'} className={S.guideTitle}>
                                        <div className={S.guideTitleBody}>
                                            Our most important dashboard
                                        </div>
                                    </div>,
                                    <GuideDetail 
                                        key={'dashboardDetail'}
                                        type="dashboard"
                                        entity={dashboards[guide.most_important_dashboard]}
                                    />
                                ]}
                                { guide.important_metrics && guide.important_metrics.length > 0 && [
                                    <div key={'metricsTitle'} className={S.guideTitle}>
                                        <div className={S.guideTitleBody}>
                                            Useful metrics
                                        </div>
                                    </div>,
                                    guide.important_metrics.map((metricId) =>
                                        <GuideDetail 
                                            key={metricId}
                                            type="metric"
                                            entity={metrics[metricId]}
                                            exploreLinks={guide.metric_important_fields[metricId] && 
                                                guide.metric_important_fields[metricId]
                                                    .map(fieldId => metadataFields[fieldId])
                                                    .map(field => ({ 
                                                        name: field.display_name || field.name,
                                                        url: getQuestionUrl({
                                                            dbId: tables[field.table_id].db_id,
                                                            tableId: field.table_id,
                                                            fieldId: field.id,
                                                            metricId
                                                        })
                                                    })) 
                                            }
                                        />
                                    ),
                                    <div key={'metricsSeeAll'} className={S.guideSeeAll}>
                                        <div className={S.guideSeeAllBody}>
                                            <Link className={cx('text-brand', S.guideSeeAllLink)} to={'/reference/metrics'}>
                                                See all metrics
                                            </Link>
                                        </div>
                                    </div>
                                ]}

                                { ((guide.important_segments && guide.important_segments.length > 0) || 
                                    (guide.important_tables && guide.important_tables.length > 0)) && [
                                    <div key={'segmentTitle'} className={S.guideTitle}>
                                        <div className={S.guideTitleBody}>
                                            Segments and tables
                                        </div>
                                    </div>,
                                    guide.important_segments.map((segmentId) =>
                                        <GuideDetail 
                                            key={segmentId}
                                            type="segment"
                                            entity={segments[segmentId]}
                                        />
                                    ),
                                    guide.important_tables.map((tableId) =>
                                        <GuideDetail 
                                            key={tableId}
                                            type="table"
                                            entity={tables[tableId]}
                                        />
                                    ),
                                    <div key={'segmentSeeAll'} className={S.guideSeeAll}>
                                        <div className={S.guideSeeAllBody}>
                                            <Link className={cx('text-purple', S.guideSeeAllLink)} to={'/reference/segments'}>
                                                See all segments
                                            </Link>
                                            <Link className={cx('text-purple', S.guideSeeAllLink)} to={'/reference/databases'}>
                                                See all tables
                                            </Link>
                                        </div>
                                    </div>
                                ]}

                                { guide.things_to_know && [
                                    <div key={'thingsToKnowTitle'} className={S.guideTitle}>
                                        <div className={S.guideTitleBody}>
                                            Some things to know
                                        </div>
                                    </div>,
                                    <GuideDetail 
                                        key={'thingsToKnowDetails'}
                                        entity={{ points_of_interest: guide.things_to_know }} 
                                    />,
                                    <div key={'thingsToKnowSeeAll'} className={S.guideSeeAll}>
                                        <div className={S.guideSeeAllBody}>
                                            <Link className={cx('text-brand', S.guideSeeAllLink)} to={'/reference/databases'}>
                                                Explore our data
                                            </Link>
                                        </div>
                                    </div>
                                ]}

                                { guide.contact && (guide.contact.name || guide.contact.email) && [
                                    <div key={'contactTitle'} className={S.guideTitle}>
                                        <div className={S.guideTitleBody}>
                                            Have questions?
                                        </div>
                                    </div>,
                                    <div key={'contactDetails'} className={S.guideContact}>
                                        <div className={S.guideContactBody}>
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
                                    </div>
                                ]}
                            </div>
                        </div>
                }
                </LoadingAndErrorWrapper>
            </form>
        );
    }
}