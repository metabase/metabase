/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import { connect } from 'react-redux';
import { reduxForm } from "redux-form";
import cx from "classnames";

import S from "metabase/reference/Reference.css";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx"
import GuideHeader from "metabase/reference/components/GuideHeader.jsx"
import GuideDetail from "metabase/reference/components/GuideDetail.jsx"
import GuideDetailEditor from "metabase/reference/components/GuideDetailEditor.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';
import {
    updateDashboard
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
    getLoading,
    getError,
    getIsEditing
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
    return {
        guide,
        user: getUser(state, props),
        dashboards,
        metrics,
        segments,
        tables,
        loading: getLoading(state, props),
        // naming this 'error' will conflict with redux form
        loadingError: getError(state, props),
        isEditing: getIsEditing(state, props),
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
            'important_segments_and_tables[].id',
            'important_segments_and_tables[].type',
            'important_segments_and_tables[].caveats',
            'important_segments_and_tables[].points_of_interest'
        ],
        initialValues: guide && {
            things_to_know: guide.things_to_know || undefined,
            contact: guide.contact || undefined,
            most_important_dashboard: guide.most_important_dashboard !== null ?
                dashboards[guide.most_important_dashboard] :
                {},
            important_metrics: guide.important_metrics && guide.important_metrics.length > 0 ? 
                guide.important_metrics.map(metricId => metrics[metricId]) :
                [{}],
            important_segments_and_tables: 
                (guide.important_segments && guide.important_segments.length > 0) ||
                (guide.important_tables && guide.important_tables.length > 0) ? 
                    guide.important_segments.map(segmentId => segments[segmentId])
                        .concat(guide.important_tables.map(tableId => tables[tableId])) :
                    [{}]
        }
    };
};

const mapDispatchToProps = {
    updateDashboard,
    updateSetting,
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'guide'
})
export default class ReferenceGettingStartedGuide extends Component {
    static propTypes = {
        isEditing: PropTypes.bool
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
            loadingError,
            loading,
            isEditing,
            startEditing,
            endEditing,
            handleSubmit,
            submitting
        } = this.props;

        const onSubmit = handleSubmit(async (fields) => 
            await tryUpdateGuide(fields, this.props)
        );

        return (
            <form className="full" style={style} onSubmit={onSubmit}>
                { isEditing &&
                    <EditHeader
                        endEditing={endEditing}
                        submitting={submitting}
                    />
                }
                <LoadingAndErrorWrapper className="full" style={style} loading={!loadingError && loading} error={loadingError}>
                { () => isEditing ? 
                    <div className="wrapper wrapper--trim">
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
                        <div className={S.guideEditTitle}>
                            What is your most important dashboard?
                        </div>
                        <GuideDetailEditor 
                            type="dashboard" 
                            entities={dashboards}
                            formField={most_important_dashboard}
                        />

                        <div className={S.guideEditTitle}>
                            What are your 3-5 most commonly referenced metrics?
                        </div>
                        { important_metrics.map((metricField, index) =>
                            <GuideDetailEditor 
                                key={index}
                                type="metric"
                                entities={metrics}
                                formField={metricField}
                            />
                        )}
                        { important_metrics.length < 5 &&
                            <div className={S.guideEditAddButton}>
                                <div className={S.guideEditAddButtonBody}>
                                    <button
                                        className="Button Button--primary Button--large" 
                                        type="button"
                                        onClick={() => important_metrics.addField()}
                                    >
                                        Add another metric
                                    </button>
                                </div>
                            </div>
                            // TODO: add multi-select for important fields, try SelectPicker.jsx
                        }

                        <div className={S.guideEditTitle}>
                            What are 3-5 commonly referenced segments or tables 
                            that would be useful for this audience?
                        </div>
                        { important_segments_and_tables.map((segmentOrTableField, index) => null
                            // <GuideDetailEditor
                            //     key={index} 
                            //     type="segment"
                            //     entities={segments}
                            //     secondaryType="table"
                            //     secondaryEntities={tables}
                            //     formField={segmentOrTableField}
                            // />
                        )}
                        { important_segments_and_tables.length < 5 &&
                            <div className={S.guideEditAddButton}>
                                <div className={S.guideEditAddButtonBody}>
                                    <button
                                        className="Button Button--primary Button--large" 
                                        type="button"
                                        onClick={() => important_segments_and_tables.addField()}
                                    >
                                        Add another segment or table
                                    </button>
                                </div>
                            </div>
                        }

                        <div className={S.guideEditTitle}>
                            What should a user of this data know before they start 
                            accessing it?
                        </div>
                        <div className={S.guideEditSubtitle}>
                            E.g., expectations around data privacy and use, common
                            pitfalls or misunderstandings, information about data 
                            warehouse performance, legal notices, etc.
                        </div>
                        <textarea 
                            className={S.guideEditTextarea} 
                            placeholder="Things to know..."
                            {...things_to_know}
                        />

                        <div className={S.guideEditTitle}>
                            Who should users contact for help if they're confused about this data?
                        </div>
                        <div className={S.guideEditContact}>
                            <input 
                                className={S.guideEditContactName} 
                                placeholder="Name" 
                                type="text"
                                {...contact.name}
                            />
                            <input 
                                className={S.guideEditContactEmail} 
                                placeholder="Email address" 
                                type="text"
                                {...contact.email}
                            />
                        </div>
                    </div> :
                    !guide || isGuideEmpty(guide) ? 
                        <GuideEmptyState 
                            isSuperuser={user && user.is_superuser}
                            startEditing={startEditing} 
                        /> : 
                        <div>
                            <GuideHeader startEditing={startEditing} />
                            <div className="wrapper wrapper--trim">
                                { guide.most_important_dashboard !== null && [
                                    <div key={'dashboardTitle'} className={S.guideTitle}>
                                        <div className={S.guideTitleBody}>
                                            Dashboard
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

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Segments and tables
                                    </div>
                                </div>
                                {
                                // <GuideDetail 
                                //     title={'Impressions'} 
                                //     description={'A table recording each ad impression with information about each impression.'} 
                                //     hasLearnMore={true}
                                //     link={'test'} 
                                //     linkClass={'text-purple'} 
                                // />
                                }
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-purple', S.guideSeeAllLink)} to={'/reference/segments'}>
                                            See all segments
                                        </Link>
                                        <Link className={cx('text-purple', S.guideSeeAllLink)} to={'/reference/databases'}>
                                            See all tables
                                        </Link>
                                    </div>
                                </div>

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Some things to know
                                    </div>
                                </div>
                                <GuideDetail 
                                    entity={{points_of_interest: 'Gaper losses league forkball pennant cubs balk no-hitter. Breaking ball national pastime series cy young left field walk off sacrifice fly cycle.'}} 
                                />
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-brand', S.guideSeeAllLink)} to={'/reference/databases'}>
                                            Explore our data
                                        </Link>
                                    </div>
                                </div>

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Have questions?
                                    </div>
                                </div>
                                <div className={S.guideContact}>
                                    <div className={S.guideContactBody}>
                                        <span className="text-dark mr3">
                                            Contact Sameer Al-Sakran
                                        </span>
                                        <a className="text-brand text-bold no-decoration" href="mailto:s-dog@metabase.com">
                                            s-dog@metabase.com
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                }
                </LoadingAndErrorWrapper>
            </form>
        );
    }
}