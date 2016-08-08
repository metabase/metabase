/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import { connect } from 'react-redux';
import { reduxForm } from "redux-form";
import cx from "classnames";

import S from "metabase/reference/Reference.css";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx"
import GuideHeader from "metabase/reference/components/GuideHeader.jsx"
import GuideDetail from "metabase/reference/components/GuideDetail.jsx"
import GuideDetailEditor from "metabase/reference/components/GuideDetailEditor.jsx"

import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getIsEditing
} from '../selectors';

import {
    isGuideEmpty
} from '../utils';

const mapStateToProps = (state, props) => ({
    guide: {
        things_to_know: "test",
        contact: { name: null, email: null },
        most_important_dashboard: null,
        important_metrics: [],
        important_tables: [],
        important_segments: []
    },
    user: getUser(state),
    isEditing: getIsEditing(state)
});

const mapDispatchToProps = {
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'guide',
    fields: []
})
export default class ReferenceGettingStartedGuide extends Component {
    static propTypes = {
        isEditing: PropTypes.bool
    };

    render() {
        const {
            style,
            guide,
            user,
            isEditing,
            startEditing,
            endEditing,
            handleSubmit,
            submitting
        } = this.props;

        const onSubmit = handleSubmit(async (fields) => 
            console.log(fields)
        );

        const dashboards = {
            1: {
                id: 1,
                name: "Dashboard1",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            2: {
                id: 2,
                name: "Dashboard2",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            3: {
                id: 3,
                name: "Dashboard3",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            4: {
                id: 4,
                name: "Dashboard4",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            5: {
                id: 5,
                name: "Dashboard5",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
        };

        const metrics = {
            1: {
                id: 1,
                name: "Metric1",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            2: {
                id: 2,
                name: "Metric2",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            }
        };

        const segments = {
            1: {
                id: 1,
                name: "Segment1",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            2: {
                id: 2,
                name: "Segment2",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            }
        };

        const tables = {
            1: {
                id: 1,
                name: "Table1",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            },
            2: {
                id: 2,
                name: "Table2",
                description: "description here description here description here description here",
                points_of_interest: null,
                caveats: null
            }
        };


        return (
            <form className="full" style={style} onSubmit={onSubmit}>
                { isEditing &&
                    <EditHeader
                        endEditing={endEditing}
                        submitting={submitting}
                    />
                }
                { isGuideEmpty(guide) ? 
                    <GuideEmptyState 
                        isSuperuser={user && user.is_superuser}
                        startEditing={startEditing} 
                    /> :
                    isEditing ?
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
                                formFields={{}}
                            />

                            <div className={S.guideEditTitle}>
                                What are your 3-5 most commonly referenced metrics?
                            </div>
                            <GuideDetailEditor 
                                type="metric" 
                                entities={metrics}
                                formFields={{}}
                            />
                            <div className={S.guideEditAddButton}>
                                <div className={S.guideEditAddButtonBody}>
                                    <button
                                        className="Button Button--primary Button--large" 
                                        type="button"
                                    >
                                        Add another metric
                                    </button>
                                </div>
                            </div>

                            <div className={S.guideEditTitle}>
                                What are 3-5 commonly referenced segments or tables 
                                that would be useful for this audience?
                            </div>
                            <GuideDetailEditor 
                                type="segment"
                                entities={segments}
                                secondaryType="table"
                                secondaryEntities={tables}

                                formFields={{}}
                            />
                            <div className={S.guideEditAddButton}>
                                <div className={S.guideEditAddButtonBody}>
                                    <button
                                        className="Button Button--primary Button--large" 
                                        type="button"
                                    >
                                        Add another segment or table
                                    </button>
                                </div>
                            </div>

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
                            />

                            <div className={S.guideEditTitle}>
                                Who should users contact for help if they're confused about this data?
                            </div>
                            <div className={S.guideEditContact}>
                                <input className={S.guideEditContactName} placeholder="Name" type="text"/>
                                <input className={S.guideEditContactEmail} placeholder="Email address" type="text"/>
                            </div>

                            <div className={S.guideEditFooter}>
                            </div>
                        </div> :
                        <div>
                            <GuideHeader startEditing={startEditing} />
                            <div className="wrapper wrapper--trim">
                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Dashboard
                                    </div>
                                </div>
                                <GuideDetail 
                                    title={'Marketing KPIs'} 
                                    description={'This dashboard contains metrics about ad buys, impressions, etc.'} 
                                    link={'test'} 
                                    linkClass={'text-green'} 
                                />
                                
                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Useful metrics
                                    </div>
                                </div>
                                <GuideDetail 
                                    title={'Cost per click'} 
                                    description={'How much we pay for each click that we receive, not counting some esoteric exceptions.'} 
                                    hasLearnMore={true}
                                    exploreLinks={[
                                        {id: 'test1', name: 'Ad Campaign'},
                                        {id: 'test2', name: 'Platform'},
                                        {id: 'test3', name: 'Channel'}
                                    ]}
                                    link={'test'} 
                                    linkClass={'text-brand'} 
                                />
                                <GuideDetail 
                                    title={'Cost per click'} 
                                    description={'How much we pay for each click that we receive, not counting some esoteric exceptions.'} 
                                    hasLearnMore={true}
                                    exploreLinks={[
                                        {id: 'test1', name: 'Ad Campaign'},
                                        {id: 'test2', name: 'Platform'},
                                        {id: 'test3', name: 'Channel'}
                                    ]}
                                    link={'test'} 
                                    linkClass={'text-brand'} 
                                />
                                <div className={S.guideSeeAll}>
                                    <div className={S.guideSeeAllBody}>
                                        <Link className={cx('text-brand', S.guideSeeAllLink)} to={'/reference/metrics'}>
                                            See all metrics
                                        </Link>
                                    </div>
                                </div>

                                <div className={S.guideTitle}>
                                    <div className={S.guideTitleBody}>
                                        Segments and tables
                                    </div>
                                </div>
                                <GuideDetail 
                                    title={'Impressions'} 
                                    description={'A table recording each ad impression with information about each impression.'} 
                                    hasLearnMore={true}
                                    link={'test'} 
                                    linkClass={'text-purple'} 
                                />
                                <GuideDetail 
                                    title={'Impressions'} 
                                    description={'A table recording each ad impression with information about each impression.'} 
                                    hasLearnMore={true}
                                    link={'test'} 
                                    linkClass={'text-purple'} 
                                />
                                <GuideDetail 
                                    title={'Impressions'} 
                                    description={'A table recording each ad impression with information about each impression.'} 
                                    hasLearnMore={true}
                                    link={'test'} 
                                    linkClass={'text-purple'} 
                                />
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
                                    description={'Gaper losses league forkball pennant cubs balk no-hitter. Breaking ball national pastime series cy young left field walk off sacrifice fly cycle.'} 
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
            </form>
        );
    }
}